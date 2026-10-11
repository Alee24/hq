from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.database import engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from app.models import ClassSession, AttendanceRecord, User, Course, EntryLog, Visitor
from app.email_utils import send_attendance_email
from datetime import datetime
from app.utils.timezone import get_eat_time
import csv
import os

scheduler = AsyncIOScheduler()

async def generate_and_send_daily_reports():
    print("Running Daily Attendance Reporting Job...")
    today = get_eat_time().date()
    
    async with AsyncSession(engine) as session:
        # Find distinct sessions today
        # We assume lecturer_id is on ClassSession (it is)
        query = (
            select(ClassSession, Course, User)
            .join(Course, ClassSession.course_id == Course.id)
            .join(User, ClassSession.lecturer_id == User.id)
            .where(ClassSession.session_date == today)
        )
        
        results = await session.exec(query)
        sessions_data = results.all()
        
        print(f"Found {len(sessions_data)} sessions for today: {today}")
        
        for class_session, course, lecturer in sessions_data:
            if not lecturer.email:
                print(f"Skipping {course.course_code}: Lecturer has no email.")
                continue
                
            # Fetch Attendance (Present students)
            att_query = (
                select(AttendanceRecord, User)
                .join(User, AttendanceRecord.student_id == User.id)
                .where(AttendanceRecord.session_id == class_session.id)
                .order_by(AttendanceRecord.scan_time)
            )
            attendance_rows = (await session.exec(att_query)).all()
            
            # Temporary File Location
            filename = f"Attendance_{course.course_code}_{today}.csv"
            filepath = os.path.abspath(f"temp_{filename}")
            
            try:
                with open(filepath, mode='w', newline='') as file:
                    writer = csv.writer(file)
                    writer.writerow(["Student Name", "Admission No", "Time Scanned", "Status"])
                    for record, student in attendance_rows:
                        writer.writerow([
                            student.full_name, 
                            student.admission_number, 
                            record.scan_time.strftime("%H:%M:%S") if record.scan_time else "",
                            record.status
                        ])
                
                # HTML Body
                body = f"""
                <div style="font-family: Arial, sans-serif;">
                    <h2>Attendance Report</h2>
                    <p><strong>Course:</strong> {course.course_name} ({course.course_code})</p>
                    <p><strong>Date:</strong> {today}</p>
                    <p><strong>Total Present:</strong> {len(attendance_rows)}</p>
                    <hr/>
                    <p>Please find the detailed attendance register attached as a CSV file.</p>
                    <p><em>Smart Campus System</em></p>
                </div>
                """
                
                await send_attendance_email(
                    recipients=[lecturer.email],
                    subject=f"Daily Attendance: {course.course_code} - {today}",
                    body=body,
                    attachments=[filepath]
                )
            
            except Exception as e:
                print(f"Error generating report for {course.course_code}: {e}")
            finally:
                # Cleanup
                if os.path.exists(filepath):
                    os.remove(filepath)

async def auto_checkout_users_and_visitors():
    print("Running Auto Checkout Job...")
    now = get_eat_time()
    
    async with AsyncSession(engine) as session:
        # Checkout Users (EntryLog)
        open_logs = (await session.exec(select(EntryLog).where(EntryLog.exit_time == None))).all()
        for log in open_logs:
            log.exit_time = now
            session.add(log)
            
        # Checkout Visitors
        open_visitors = (await session.exec(select(Visitor).where(Visitor.status == "checked_in"))).all()
        for visitor in open_visitors:
            visitor.time_out = now
            visitor.status = "checked_out"
            session.add(visitor)
            
        # Checkout Vehicles (VehicleLog) and Parking Sessions where the vehicle is not a fleet vehicle
        from app.models import Vehicle, VehicleLog
        from app.parking_models import ParkingSession, ParkingSpace
        from sqlalchemy import func
        from sqlalchemy.orm import selectinload
        
        # 1. Checkout open VehicleLogs for non-fleet vehicles
        open_vehicle_logs = (
            await session.exec(
                select(VehicleLog)
                .join(Vehicle, VehicleLog.vehicle_id == Vehicle.id)
                .where(VehicleLog.exit_time == None)
                .where(Vehicle.is_fleet == False)
                .options(selectinload(VehicleLog.vehicle))
            )
        ).all()
        
        for log in open_vehicle_logs:
            log.exit_time = now
            session.add(log)

        # 2. Daily midnight reset of active parking sessions:
        # Fleet vehicles are explicitly preserved (they are NOT allowed to auto-checkout / reset)
        fleet_vehicles = (await session.exec(select(Vehicle).where(Vehicle.is_fleet == True))).all()
        fleet_plates = {
            f.plate_number.replace(" ", "").replace("-", "").replace("_", "").upper()
            for f in fleet_vehicles if f.plate_number
        }

        active_sessions = (await session.exec(
            select(ParkingSession).where(ParkingSession.status == "active")
        )).all()

        closed_sessions_count = 0
        for sess in active_sessions:
            sess_plate_clean = (sess.plate_number or "").replace(" ", "").replace("-", "").replace("_", "").upper()
            # If vehicle is in fleet, do NOT check out
            if sess_plate_clean in fleet_plates:
                continue

            sess.status = "completed"
            sess.check_out = now
            sess.notes = (sess.notes or "") + " | Auto-reset at midnight"
            session.add(sess)
            closed_sessions_count += 1
            
            space = await session.get(ParkingSpace, sess.space_id)
            if space:
                space.status = "available"
                session.add(space)

        # Reset all standard spaces in parking zones to 'available' if no active session occupies them
        all_spaces = (await session.exec(select(ParkingSpace).where(ParkingSpace.status == "occupied"))).all()
        remaining_active_sess = (await session.exec(
            select(ParkingSession).where(ParkingSession.status == "active")
        )).all()
        active_space_ids = {s.space_id for s in remaining_active_sess}
        for sp in all_spaces:
            if sp.id not in active_space_ids:
                sp.status = "available"
                session.add(sp)
            
        await session.commit()
        print(f"Midnight Auto-Reset: Checked out {len(open_logs)} users, {len(open_visitors)} visitors, {len(open_vehicle_logs)} non-fleet vehicles, and reset {closed_sessions_count} parking sessions (fleet vehicles kept parked).")

async def scrub_expired_sensitive_data():
    """
    Auto Scrub Sensitive Data Job:
    If visitor requested auto-delete (auto_delete_24h or delete_after_checkout)
    and has been checked out or 24 hours have elapsed, scrub contact and media fields,
    marking status as 'purged' without dummy placeholders.
    """
    print("Running Auto Scrub Sensitive Data Job...")
    from datetime import timedelta
    from sqlmodel import or_, and_, select
    from sqlmodel.ext.asyncio.session import AsyncSession
    from app.models import Visitor
    from app.database import engine
    from app.utils.timezone import get_eat_time
    from app.routers.gate_control import anonymize_visitor_if_requested

    now = get_eat_time()
    async with AsyncSession(engine) as session:
        stmt = (
            select(Visitor)
            .where(or_(Visitor.auto_delete_24h == True, Visitor.delete_after_checkout == True))
            .where(Visitor.status != "purged")
            .where(
                or_(
                    Visitor.phone_number.is_not(None),
                    Visitor.email.is_not(None),
                    Visitor.profile_image.is_not(None)
                )
            )
            .where(
                or_(
                    Visitor.status == "checked_out",
                    Visitor.time_out != None,
                    Visitor.time_in <= (now - timedelta(hours=24))
                )
            )
        )
        results = await session.exec(stmt)
        expired_visitors = results.all()
        for visitor in expired_visitors:
            anonymize_visitor_if_requested(visitor)
            session.add(visitor)
        if expired_visitors:
            await session.commit()
            print(f"Auto-scrubbed {len(expired_visitors)} visitor entries as per KDPA privacy request.")


async def generate_weekly_attendance_packs():
    """Sunday job: email next week's QR packs to lecturers with active timetable slots."""
    print("Running weekly attendance QR pack job...")
    from datetime import timedelta
    from app.models import TimetableSlot
    from app.services.attendance_pack_service import AttendancePackService, week_dates

    today = get_eat_time().date()
    # Next Monday
    days_ahead = (7 - today.weekday()) % 7
    week_start = today if days_ahead == 0 else today + timedelta(days=days_ahead)
    if today.weekday() == 6:  # Sunday → upcoming week starting tomorrow
        week_start = today + timedelta(days=1)

    async with AsyncSession(engine) as session:
        lecturer_ids = (
            await session.exec(
                select(TimetableSlot.lecturer_id).where(
                    TimetableSlot.is_active == True,  # noqa: E712
                    TimetableSlot.lecturer_id != None,  # noqa: E711
                )
            )
        ).all()
        unique_lecturers = {lid for lid in lecturer_ids if lid}
        svc = AttendancePackService(session)
        for lecturer_id in unique_lecturers:
            lecturer = await session.get(User, lecturer_id)
            if not lecturer:
                continue
            occs = await svc.generate_for_lecturer(lecturer_id, week_start)
            await svc.email_pack(lecturer, occs, week_start)
            print(f"Pack for {lecturer.email or lecturer_id}: {len(occs)} occurrences (week {week_dates(week_start)[0]})")


async def send_daily_event_summaries():
    print("Running daily event summary job...")
    from app.models import Event, EventVisitor, User
    from sqlmodel import select, or_
    from app.email_utils import send_email_async
    
    now = get_eat_time()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    async with AsyncSession(engine) as session:
        # Find events occurring today or in the future
        stmt = select(Event).where(
            or_(Event.event_date >= today_start.date(), Event.end_date >= today_start.date())
        )
        events = (await session.exec(stmt)).all()
        
        for event in events:
            host_email = getattr(event, 'host_email', None)
            if not host_email:
                try:
                    host_user = (await session.exec(select(User).where(User.full_name.contains(event.host or '')).limit(1))).first()
                    if host_user:
                        host_email = host_user.email
                except:
                    pass
                    
            if not host_email or '@' not in host_email:
                continue
                
            # Count registrations created today (since midnight)
            # Assuming EventVisitor doesn't have a direct created_at if it's via Visitor, wait EventVisitor does have created_at!
            # Let's check EventVisitor model. Wait, there is no EventVisitor model. Event registration creates a Visitor with event_id!
            from app.models import Visitor
            reg_stmt = select(Visitor).where(
                Visitor.event_id == event.id,
                Visitor.created_at >= today_start
            )
            regs = (await session.exec(reg_stmt)).all()
            
            if len(regs) > 0:
                subject = f"📅 Daily Registration Summary: {event.name}"
                html = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #7A1975 0%, #5a1058 100%); padding: 30px; text-align: center;">
                        <h2 style="color: white; margin: 0; font-size: 24px;">Daily Registration Summary</h2>
                        <p style="color: #e8d5e7; margin-top: 8px;">{event.name}</p>
                    </div>
                    <div style="padding: 30px; background: white;">
                        <p style="color: #374151; font-size: 16px;">Hello <strong>{event.host or 'Event Host'}</strong>,</p>
                        <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">Here is your daily registration summary for your upcoming event. This report covers all new registrations processed today.</p>
                        <div style="background: #f9f4f9; border: 1px solid #e8d5e7; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                            <div style="font-size: 13px; color: #7A1975; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">New Registrations Today</div>
                            <div style="font-size: 48px; font-weight: 900; color: #5a1058; margin: 10px 0;">{len(regs)}</div>
                            <div style="font-size: 14px; color: #6b7280;">Total Event Expected: {event.expected_visitors or 'N/A'}</div>
                        </div>
                        <p style="color: #4b5563; font-size: 14px; text-align: center;">Please log in to the Smart Campus admin dashboard to view the full guest list, print passes, or manage settings.</p>
                    </div>
                </div>
                """
                try:
                    await send_email_async(
                        to_email=host_email,
                        subject=subject,
                        html_content=html,
                        from_name="Smart Campus Events"
                    )
                    print(f"Sent event summary to {host_email} for {event.name}: {len(regs)} registrations")
                except Exception as e:
                    print(f"Failed to send event summary to {host_email}: {e}")

async def sync_guest_vehicles_job():
    """Register any visitor / event-guest plate that is not yet in the vehicles table."""
    from app.services.guest_vehicle_registry import backfill_guest_vehicles
    try:
        async with AsyncSession(engine) as session:
            created = await backfill_guest_vehicles(session)
            if created:
                print(f"Guest vehicle registry: added {created} plate(s) to vehicles table")
    except Exception as e:
        print(f"Guest vehicle registry sync failed: {e}")

async def check_portal_licensing_heartbeat_job():
    """Phones home to Central Licensing Vendor Portal to verify license status and check remote revocation."""
    try:
        from app.licensing.manager import license_manager
        res = await license_manager.check_portal_heartbeat()
        if res.get("is_revoked"):
            print(f"[Licensing Heartbeat] WARNING: REMOTE REVOCATION ENFORCED: {res.get('reason')}")
        elif res.get("is_valid"):
            print("[Licensing Heartbeat] Central portal heartbeat acknowledged OK.")
    except Exception as e:
        print(f"[Licensing Heartbeat] Heartbeat check non-fatal exception: {e}")

def start_scheduler():
    # Schedule report at 6:00 PM every day
    try:
        from app.services.erp_sync_service import sync_erp_users_background_job

        scheduler.add_job(generate_and_send_daily_reports, 'cron', hour=18, minute=0)
        scheduler.add_job(auto_checkout_users_and_visitors, 'cron', hour=0, minute=0)
        scheduler.add_job(send_daily_event_summaries, 'cron', hour=0, minute=5)
        scheduler.add_job(scrub_expired_sensitive_data, 'interval', hours=1)
        scheduler.add_job(generate_weekly_attendance_packs, 'cron', day_of_week='sun', hour=18, minute=0)
        # Synchronize ERP users to local DB every 5 hours
        scheduler.add_job(
            sync_erp_users_background_job,
            'interval',
            hours=5,
            id='erp_users_sync_5h',
            replace_existing=True
        )
        scheduler.add_job(
            sync_guest_vehicles_job,
            'interval',
            minutes=10,
            id='guest_vehicles_sync_10m',
            replace_existing=True
        )
        scheduler.add_job(
            check_portal_licensing_heartbeat_job,
            'interval',
            seconds=30,
            id='licensing_portal_heartbeat_30s',
            replace_existing=True
        )
        scheduler.start()
        print("Scheduler Started: Daily Reports at 18:00, Auto Checkout at 00:00, Event Summaries at 00:05, Auto-Scrub hourly, Weekly QR packs Sun 18:00, ERP Sync every 5 hours, Portal License Heartbeat every 30 seconds")
    except Exception as e:
        print(f"Failed to start scheduler: {e}")

