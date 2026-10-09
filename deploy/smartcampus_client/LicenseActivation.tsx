import React, { useState, useEffect } from 'react'
import {
    ShieldCheck, ShieldAlert, Key, Cpu, Copy, Check, UploadCloud,
    FileCheck, RefreshCw, ArrowRight, Lock, AlertTriangle, Building2,
    Layers, CheckCircle2, Clock, Calendar, Users, DoorOpen, Phone,
    Mail, Globe, MessageSquare, ExternalLink, LockKeyhole, Sparkles, ChevronDown, ChevronUp, User
} from 'lucide-react'

export interface LicenseStatusData {
    is_valid: boolean
    status: 'ACTIVE' | 'GRACE_PERIOD' | 'LOCKED' | 'UNLICENSED' | 'EXPIRED' | 'HARDWARE_MISMATCH' | 'TAMPERED' | 'INVALID_SIGNATURE' | string
    message: string
    licensee: string
    tier: string
    machine_id?: string
    server_machine_id: string
    expires_at?: string
    days_remaining: number
    is_perpetual?: boolean
    in_grace_period: boolean
    grace_days_remaining: number
    grace_seconds_remaining: number
    grace_deadline?: string
    is_locked: boolean
    lock_reason?: string
    contact_email?: string
    contact_phone?: string
    contact_whatsapp?: string
    contact_website?: string
    max_users: number
    max_gates: number
    modules: string[]
    issued_at?: string
    license_id?: string
    installation_limit?: number
    product_name?: string
    command_center_connected?: boolean
}

interface LicenseActivationProps {
    isEmbedded?: boolean
    onActivated?: () => void
}

export default function LicenseActivation({ isEmbedded = false, onActivated }: LicenseActivationProps) {
    const [status, setStatus] = useState<LicenseStatusData | null>(null)
    const [companyName, setCompanyName] = useState<string>('')
    const [showReactivation, setShowReactivation] = useState(false)
    const [fallbackMachineId, setFallbackMachineId] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [activating, setActivating] = useState(false)
    const [copiedMid, setCopiedMid] = useState(false)
    const [copiedEmail, setCopiedEmail] = useState(false)
    const [copiedPhone, setCopiedPhone] = useState(false)
    const [licenseKeyInput, setLicenseKeyInput] = useState('')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const [successMsg, setSuccessMsg] = useState('')
    const [isDragOver, setIsDragOver] = useState(false)
    const [secondsRemaining, setSecondsRemaining] = useState<number>(0)
    const [portalStatus, setPortalStatus] = useState<{ is_online: boolean; portal_url: string; latency_ms: number; status: string } | null>(null)
    const [verifyingOnline, setVerifyingOnline] = useState(false)

    const fetchPortalStatus = async () => {
        try {
            const res = await fetch('/api/license/portal-status')
            if (res.ok) {
                const data = await res.json()
                setPortalStatus(data)
            }
        } catch {}
    }

    const handleVerifyOnline = async () => {
        setVerifyingOnline(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            const res = await fetch('/api/license/phone-home', { method: 'POST' })
            const data = await res.json()
            if (data.status) {
                setStatus(data.status)
                if (data.status.is_valid) {
                    setSuccessMsg('License status verified and synchronized successfully.')
                } else if (data.status.is_locked) {
                    setErrorMsg(data.status.message || 'Remote revocation or lockdown is active.')
                }
            }
            fetchPortalStatus()
        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to verify license status.')
        } finally {
            setVerifyingOnline(false)
        }
    }

    // Fetch Machine ID directly to guarantee it is NEVER stuck at "Detecting..."
    const fetchFingerprint = async () => {

        try {
            const res = await fetch('/api/license/fingerprint')
            if (res.ok) {
                const data = await res.json()
                if (data.machine_id) {
                    setFallbackMachineId(data.machine_id)
                }
            }
        } catch {
            // Non-critical fallback
        }
    }

    const fetchStatus = async () => {
        setLoading(true)
        setErrorMsg('')
        try {
            // Parallel fetch status and fingerprint for maximum resilience
            fetchFingerprint()

            const res = await fetch('/api/license/status')
            if (res.ok) {
                const data: LicenseStatusData = await res.json()
                setStatus(data)
                if (data.server_machine_id) {
                    setFallbackMachineId(data.server_machine_id)
                }
                if (data.grace_seconds_remaining > 0) {
                    setSecondsRemaining(data.grace_seconds_remaining)
                } else if (data.in_grace_period && data.grace_days_remaining > 0) {
                    setSecondsRemaining(data.grace_days_remaining * 86400)
                }
            } else {
                setErrorMsg('Unable to retrieve current license status from the server.')
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to connect to licensing service.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()
        fetchFingerprint()
        fetchPortalStatus()

        // Fetch company name dynamically from public company settings
        fetch('/api/users/public-company-settings')
            .then(res => res.json())
            .then(data => {
                if (data && data.company_name) {
                    setCompanyName(data.company_name)
                }
            })
            .catch(() => {})
    }, [])


    // Real-time ticking interval for the 7-day grace period countdown
    useEffect(() => {
        if (secondsRemaining <= 0) return

        const timer = setInterval(() => {
            setSecondsRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(timer)
                    fetchStatus()
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(timer)
    }, [secondsRemaining])

    const handleCopyMachineId = () => {
        const mid = status?.server_machine_id || fallbackMachineId || ''
        if (!mid) return
        navigator.clipboard.writeText(mid)
        setCopiedMid(true)
        setTimeout(() => setCopiedMid(false), 2500)
    }

    const handleCopyEmail = () => {
        navigator.clipboard.writeText('mettoalex@gmail.com')
        setCopiedEmail(true)
        setTimeout(() => setCopiedEmail(false), 2500)
    }

    const handleCopyPhone = () => {
        navigator.clipboard.writeText('+254 724 454 757')
        setCopiedPhone(true)
        setTimeout(() => setCopiedPhone(false), 2500)
    }

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0]
            if (file.name.endsWith('.lic') || file.name.endsWith('.txt') || file.name.endsWith('.key')) {
                setSelectedFile(file)
            } else {
                setErrorMsg('Please select a valid .lic certificate file.')
            }
        }
    }

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0])
            setErrorMsg('')
        }
    }

    const handleActivateWithKey = async (e: React.FormEvent) => {
        e.preventDefault()
        const key = licenseKeyInput.trim()
        if (!key) {
            setErrorMsg('Please paste your activation key or certificate string.')
            return
        }

        setActivating(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            const res = await fetch('/api/license/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: key })
            })
            const data = await res.json()

            if (res.ok && data.success) {
                setSuccessMsg(data.message || 'License activated successfully!')
                setStatus(data.status)
                setLicenseKeyInput('')
                if (onActivated) onActivated()
            } else {
                setErrorMsg(data.detail || data.message || 'License activation was rejected.')
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Network error while contacting licensing gateway.')
        } finally {
            setActivating(false)
        }
    }

    const handleActivateWithFile = async () => {
        if (!selectedFile) {
            setErrorMsg('Please select a .lic certificate file to upload.')
            return
        }

        setActivating(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            const formData = new FormData()
            formData.append('file', selectedFile)

            const res = await fetch('/api/license/upload', {
                method: 'POST',
                body: formData
            })
            const data = await res.json()

            if (res.ok && data.success) {
                setSuccessMsg(data.message || 'License certificate accepted and activated!')
                setStatus(data.status)
                setSelectedFile(null)
                if (onActivated) onActivated()
            } else {
                setErrorMsg(data.detail || data.message || 'Uploaded license file was rejected.')
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Network error while uploading license file.')
        } finally {
            setActivating(false)
        }
    }

    const handleProceedToApp = () => {
        window.location.href = '/'
    }

    const serverMid = status?.server_machine_id || fallbackMachineId || 'Detecting...'

    // Breakdown countdown components
    const days = Math.floor(secondsRemaining / 86400)
    const hours = Math.floor((secondsRemaining % 86400) / 3600)
    const minutes = Math.floor((secondsRemaining % 3600) / 60)
    const seconds = secondsRemaining % 60

    const isInGrace = status?.status === 'GRACE_PERIOD' || status?.in_grace_period || secondsRemaining > 0
    const isLocked = status?.status === 'LOCKED' || status?.is_locked

    const content = (
        <div className="w-full max-w-4xl mx-auto space-y-6">
            {/* Header Card */}
            <div className="bg-gradient-to-r from-[#7A1975] via-[#5a1058] to-[#3a0838] text-white p-6 sm:p-8 rounded-3xl shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/5 rounded-full pointer-events-none blur-2xl" />
                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
                            {status?.is_valid && !isInGrace ? (
                                <ShieldCheck className="w-8 h-8 text-emerald-300" />
                            ) : isLocked ? (
                                <LockKeyhole className="w-8 h-8 text-rose-300 animate-pulse" />
                            ) : (
                                <Lock className="w-8 h-8 text-amber-300" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white font-black text-[10px] uppercase tracking-wider backdrop-blur-sm">
                                    Enterprise Security
                                </span>
                                <span className="text-xs text-purple-200">Asymmetric Ed25519 Node-Lock</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 text-white">
                                Smart Campus License Gateway
                            </h1>
                        </div>
                    </div>

                    <button
                        onClick={fetchStatus}
                        disabled={loading}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 flex items-center gap-2 transition-all self-end md:self-center shrink-0 active:scale-95 cursor-pointer"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span>Refresh Status</span>
                    </button>
                </div>
            </div>

            {/* Enterprise License Verification Status */}
            <div className="px-5 py-3.5 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                        <div className="font-bold text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
                            <span>License Verification Service:</span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                {status?.is_valid && !isInGrace ? 'Verified & Certified' : 'Operational'}
                            </span>
                            {status?.license_id && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 font-mono text-[11px] font-bold border border-purple-500/20">
                                    License ID: {status.license_id}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleVerifyOnline}
                    disabled={verifyingOnline}
                    className="px-3.5 py-2 rounded-xl bg-[var(--bg-primary)] hover:bg-purple-50 dark:hover:bg-purple-950/40 text-[var(--text-primary)] hover:text-purple-600 border border-[var(--border-color)] font-semibold flex items-center gap-1.5 transition active:scale-95 shrink-0 shadow-sm cursor-pointer"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${verifyingOnline ? 'animate-spin text-purple-600' : ''}`} />
                    <span>{verifyingOnline ? 'Verifying...' : 'Verify License'}</span>
                </button>
            </div>


            {/* Error or Success Banners */}
            {errorMsg && (
                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 rounded-2xl flex items-start gap-3 text-rose-800 dark:text-rose-200 text-sm animate-shake">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
                    <div className="flex-1 font-semibold">{errorMsg}</div>
                </div>
            )}

            {successMsg && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-start gap-3 text-emerald-800 dark:text-emerald-200 text-sm">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                    <div className="flex-1 font-semibold">{successMsg}</div>
                </div>
            )}

            {/* 7-DAY GRACE PERIOD COUNTDOWN CARD (When Unlicensed or In Grace) */}
            {isInGrace && !isLocked && (
                <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 text-white shadow-xl relative overflow-hidden border-2 border-amber-300/60">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 border-b border-white/20 pb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                                <Clock className="w-7 h-7 text-amber-100 animate-pulse" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-full bg-black/25 text-amber-100 text-[10px] font-black uppercase tracking-wider">
                                        Evaluation Period
                                    </span>
                                    <span className="text-xs text-amber-100 font-bold">7-Day Automatic Lock Window</span>
                                </div>
                                <h2 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                                    System Auto-Lockdown Countdown
                                </h2>
                            </div>
                        </div>
                    </div>

                    {/* Big Countdown Digits */}
                    <div className="py-6">
                        <div className="grid grid-cols-4 gap-2.5 sm:gap-4 max-w-lg mx-auto text-center">
                            <div className="bg-black/30 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-white/20 shadow-inner">
                                <span className="text-2xl sm:text-4xl font-black font-mono tracking-tight block">
                                    {String(days).padStart(2, '0')}
                                </span>
                                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-200">
                                    Days
                                </span>
                            </div>

                            <div className="bg-black/30 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-white/20 shadow-inner">
                                <span className="text-2xl sm:text-4xl font-black font-mono tracking-tight block">
                                    {String(hours).padStart(2, '0')}
                                </span>
                                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-200">
                                    Hours
                                </span>
                            </div>

                            <div className="bg-black/30 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-white/20 shadow-inner">
                                <span className="text-2xl sm:text-4xl font-black font-mono tracking-tight block">
                                    {String(minutes).padStart(2, '0')}
                                </span>
                                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-200">
                                    Minutes
                                </span>
                            </div>

                            <div className="bg-black/30 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-white/20 shadow-inner">
                                <span className="text-2xl sm:text-4xl font-black font-mono tracking-tight block animate-pulse">
                                    {String(seconds).padStart(2, '0')}
                                </span>
                                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-200">
                                    Seconds
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-2 pt-4 border-t border-white/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                        <span className="text-amber-100 font-medium">An authentic signed license key is required before the grace period ends.</span>
                        <a
                            href="#activation-form"
                            className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold transition-all shadow-md active:scale-95 shrink-0"
                        >
                            Enter License Key
                        </a>
                    </div>
                </div>
            )}

            {/* FULL LOCKDOWN ALERT CARD (When 7-day grace period has expired) */}
            {isLocked && (
                <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-red-600 via-rose-700 to-black text-white shadow-2xl relative overflow-hidden border-2 border-red-400">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
                                <LockKeyhole className="w-8 h-8 text-white animate-pulse" />
                            </div>
                            <div>
                                <span className="px-3 py-1 rounded-full bg-red-950 text-red-200 font-black text-xs uppercase tracking-wider border border-red-500/50 inline-block mb-1">
                                    Permanent Lockdown
                                </span>
                                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                                    SYSTEM LOCKED
                                </h2>
                            </div>
                        </div>

                        <a
                            href="#activation-form"
                            className="w-full sm:w-auto px-6 py-3.5 bg-red-950 hover:bg-red-900 text-white font-bold text-xs uppercase tracking-wider rounded-2xl border border-red-400/60 shadow-xl flex items-center justify-center gap-2 active:scale-95 cursor-pointer shrink-0"
                        >
                            <Key className="w-4 h-4 text-red-200" />
                            <span>Enter Valid License</span>
                        </a>
                    </div>
                </div>
            )}

            {/* Active License Status Card (if licensed & not in grace) */}
            {status?.is_valid && !isInGrace && (() => {
                const resolvedLicensee = (companyName && companyName.trim() && companyName !== 'Riara University')
                    ? companyName.trim()
                    : ((status.licensee && status.licensee !== 'Riara University' && status.licensee !== 'Customer' && status.licensee !== 'Enterprise Campus' && status.licensee !== 'Unlicensed Evaluation')
                        ? status.licensee
                        : (companyName || status.licensee || 'Enterprise Campus'))

                const isLifetime = Boolean(status.is_perpetual || (status.days_remaining && status.days_remaining > 3650) || status.tier === 'lifetime' || (status.expires_at && (status.expires_at.startsWith('2099') || status.expires_at.includes('Perpetual'))))

                return (
                    <div className="glass-card p-6 sm:p-8 rounded-3xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-50/40 via-white to-emerald-50/20 dark:from-emerald-950/20 dark:via-slate-900 dark:to-emerald-950/10 shadow-xl space-y-5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-emerald-200/60 dark:border-emerald-800/60 pb-5">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                                    <Check className="w-7 h-7 stroke-[3]" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                                            Operational Status: Certified Active &amp; Permanently Licensed
                                        </span>
                                    </div>
                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
                                        {resolvedLicensee}
                                    </h3>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <span className="px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500 text-white shadow-sm flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>{isLifetime ? 'Lifetime Enterprise' : `${status.tier} Edition`}</span>
                                </span>
                            </div>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                            <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-emerald-200/50 dark:border-emerald-800/50 shadow-sm">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>License Validity</span>
                                </div>
                                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                    {isLifetime ? (
                                        <>
                                            <span className="text-xl">∞</span>
                                            <span>Perpetual</span>
                                        </>
                                    ) : (
                                        <span>{status.days_remaining} Days</span>
                                    )}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 truncate font-medium">
                                    {isLifetime ? 'Never Expires • Lifetime' : `Exp: ${status.expires_at ? new Date(status.expires_at).toLocaleDateString() : 'Perpetual'}`}
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                                    <Users className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Max Users</span>
                                </div>
                                <div className="text-lg font-black text-slate-900 dark:text-white">
                                    {status.max_users >= 100000 ? 'Unlimited' : status.max_users.toLocaleString()}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 truncate font-medium">
                                    Active Directory Capacity
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                                    <DoorOpen className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Gate Terminals</span>
                                </div>
                                <div className="text-lg font-black text-slate-900 dark:text-white">
                                    {status.max_gates >= 999 ? 'Unlimited' : status.max_gates} Gates
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 truncate font-medium">
                                    All Turnstiles Unlocked
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Modules</span>
                                </div>
                                <div className="text-lg font-black text-slate-900 dark:text-white truncate">
                                    {status.modules.includes('all') ? 'All Modules Enabled' : `${status.modules.length} Modules`}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 truncate font-medium">
                                    Full Platform Access
                                </div>
                            </div>
                        </div>

                        {/* License Key Info Banner */}
                        {status.license_id && (
                            <div className="p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-purple-600/10 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold">
                                        <Key className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <span>License ID:</span>
                                            <span className="font-mono text-purple-700 dark:text-purple-300 font-black">{status.license_id}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/20 text-[11px]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Verified Instance
                                    </span>
                                </div>
                            </div>
                        )}

                        {!isEmbedded && (
                            <div className="pt-2 flex justify-end">
                                <button
                                    onClick={handleProceedToApp}
                                    className="px-6 py-3 bg-[#7A1975] hover:bg-[#60125c] text-white font-bold rounded-2xl shadow-lg shadow-purple-950/20 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
                                >
                                    <span>Proceed to Campus Dashboard</span>
                                    <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                )
            })()}

            {/* Server Machine ID Card */}
            <div className="glass-card p-6 sm:p-7 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4 bg-white/90 dark:bg-slate-900/90 shadow-md">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-[#7A1975] dark:text-purple-300 flex items-center justify-center shrink-0">
                            <Cpu className="w-5 h-5" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            Server Machine Fingerprint
                        </h3>
                    </div>

                    <button
                        type="button"
                        onClick={handleCopyMachineId}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 active:scale-95 cursor-pointer"
                    >
                        {copiedMid ? (
                            <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-600">Copied!</span>
                            </>
                        ) : (
                            <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy ID</span>
                            </>
                        )}
                    </button>
                </div>

                <div className="p-4 bg-slate-900 text-purple-300 font-mono text-base sm:text-lg font-bold rounded-2xl border border-slate-800 tracking-wider flex items-center justify-between overflow-x-auto shadow-inner">
                    <span>{serverMid}</span>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-sans ml-4 shrink-0 font-bold">
                        Hardware Lock Node
                    </span>
                </div>
            </div>

            {/* When already certified active: show clear status banner with optional re-key toggle */}
            {status?.is_valid && !isInGrace && !showReactivation && (
                <div className="glass-card p-5 sm:p-6 rounded-3xl border border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            Platform License is Active
                        </h4>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowReactivation(true)}
                        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                        <span>Re-key or Change License</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Software Developer & Official Technical Support Card */}
            {(!status?.is_valid || isInGrace || showReactivation) && (
            <div className="glass-card p-6 sm:p-7 rounded-3xl border-2 border-purple-500/30 bg-white/90 dark:bg-slate-900/95 space-y-4 shadow-xl relative overflow-hidden backdrop-blur-md">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4 relative z-10">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-[#7A1975] dark:text-purple-300 text-[10px] font-black uppercase tracking-wider border border-purple-200 dark:border-purple-800">
                                Official Licensing Authority
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Software Developer Verification</span>
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                            Software Developer & Technical Support
                        </h2>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                            Only an authentic, cryptographically signed enterprise license issued by the software developer can activate or unlock this installation. Contact the developer with your <strong className="text-purple-700 dark:text-purple-400">Server Machine Fingerprint</strong> to receive your authorized license key or certificate.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10">
                    {/* Developer Info */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2 shadow-inner">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            Software Developer
                        </span>
                        <div>
                            <span className="text-sm font-black text-slate-900 dark:text-white block">
                                Alex Metto
                            </span>
                            <span className="text-[11px] text-[#7A1975] dark:text-purple-300 font-medium block">
                                KKDES Software Solutions
                            </span>
                        </div>
                    </div>

                    {/* Email Channel */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2 shadow-inner">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                <Mail className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                Email Channel
                            </span>
                            <button
                                type="button"
                                onClick={handleCopyEmail}
                                className="text-[10px] text-purple-600 dark:text-purple-400 font-bold hover:underline cursor-pointer"
                            >
                                {copiedEmail ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <div>
                            <a
                                href="mailto:mettoalex@gmail.com"
                                className="text-sm font-black text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate block"
                            >
                                mettoalex@gmail.com
                            </a>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">
                                Official Licensing Desk
                            </span>
                        </div>
                    </div>

                    {/* Phone & WhatsApp */}
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2 shadow-inner">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                Phone & WhatsApp
                            </span>
                            <button
                                type="button"
                                onClick={handleCopyPhone}
                                className="text-[10px] text-purple-600 dark:text-purple-400 font-bold hover:underline cursor-pointer"
                            >
                                {copiedPhone ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <a
                                    href="tel:+254724454757"
                                    className="text-sm font-black text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                    +254 724 454 757
                                </a>
                                <a
                                    href="https://wa.me/254724454757"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-black border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors"
                                >
                                    WhatsApp
                                </a>
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">
                                Direct Support Line
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            )}

            {/* License Activation Form (Keys or File) */}
            {(!status?.is_valid || isInGrace || showReactivation) && (
            <div id="activation-form" className="glass-card p-6 sm:p-7 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-5 bg-white/90 dark:bg-slate-900/90 shadow-md">
                <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Key className="w-5 h-5 text-[#7A1975]" />
                        <span>{status?.is_valid && !isInGrace ? 'Apply New License' : 'Activate License'}</span>
                    </h3>
                    {status?.is_valid && !isInGrace && (
                        <button
                            type="button"
                            onClick={() => setShowReactivation(false)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        >
                            <ChevronUp className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Method 1: Key */}
                    <form onSubmit={handleActivateWithKey} className="space-y-3 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                    License Key String
                                </label>
                            </div>
                            <textarea
                                value={licenseKeyInput}
                                onChange={(e) => setLicenseKeyInput(e.target.value)}
                                rows={5}
                                placeholder="Paste your cryptographically signed license key string here..."
                                className="w-full p-3 font-mono text-xs rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#7A1975] outline-none resize-none shadow-sm"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={activating || !licenseKeyInput.trim()}
                            className="w-full py-3 bg-[#7A1975] hover:bg-[#60125c] disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                        >
                            {activating ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Verifying Key...</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-4 h-4" />
                                    <span>Activate with Key</span>
                                </>
                            )}
                        </button>
                    </form>

                    {/* Method 2: Drag and drop .lic file */}
                    <div className="space-y-3 flex flex-col justify-between">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                                Certificate File (.lic)
                            </label>
                            <div
                                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={handleFileDrop}
                                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all h-[126px] flex flex-col items-center justify-center cursor-pointer ${
                                    isDragOver
                                        ? 'border-[#7A1975] bg-purple-50 dark:bg-purple-950/20'
                                        : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-800/50'
                                }`}
                                onClick={() => document.getElementById('lic-file-input')?.click()}
                            >
                                <input
                                    id="lic-file-input"
                                    type="file"
                                    accept=".lic,.txt,.key"
                                    className="hidden"
                                    onChange={handleFileInputChange}
                                />
                                {selectedFile ? (
                                    <div className="flex flex-col items-center gap-1 text-slate-800 dark:text-slate-200">
                                        <FileCheck className="w-7 h-7 text-emerald-600" />
                                        <span className="text-xs font-bold truncate max-w-[220px]">{selectedFile.name}</span>
                                        <span className="text-[10px] text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                        <UploadCloud className="w-7 h-7 text-slate-400" />
                                        <span className="text-xs font-semibold">Drop <span className="font-bold text-[#7A1975]">.lic</span> file here or click to browse</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleActivateWithFile}
                            disabled={activating || !selectedFile}
                            className="w-full py-3 bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                        >
                            {activating ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Uploading Certificate...</span>
                                </>
                            ) : (
                                <>
                                    <UploadCloud className="w-4 h-4" />
                                    <span>Upload & Activate Certificate</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
            )}
        </div>
    )

    if (isEmbedded) {
        return content
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 flex flex-col justify-center items-center font-sans antialiased text-slate-800 dark:text-slate-100">
            {content}
        </div>
    )
}
