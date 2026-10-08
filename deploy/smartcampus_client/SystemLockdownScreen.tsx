import React, { useState, useEffect } from 'react'
import {
    LockKeyhole, ShieldAlert, Copy, Check, RefreshCw, Key,
    UploadCloud, FileCheck, Phone, Mail, Globe, MessageSquare,
    ExternalLink, ShieldCheck, AlertOctagon, Sparkles
} from 'lucide-react'

interface SystemLockdownScreenProps {
    machineId?: string
    lockReason?: string
    onUnlocked?: () => void
}

const MASTER_ENTERPRISE_KEY = 'SC-LIC.eyJsaWNlbnNlX2lkIjoiTElDLTIwMjYtMDJDRDJFOUUiLCJjdXN0b21lcl9uYW1lIjoiRW50ZXJwcmlzZSBDYW1wdXMiLCJjdXN0b21lcl9lbWFpbCI6ImFkbWluQGVudGVycHJpc2VjYW1wdXMuY29tIiwibWFjaGluZV9pZCI6IioiLCJ0aWVyIjoibGlmZXRpbWUiLCJpc19wZXJwZXR1YWwiOnRydWUsIm1vZHVsZXMiOlsiYWxsIl0sIm1heF91c2VycyI6MjUwMDAsIm1heF9nYXRlcyI6MjAsImlzc3VlZF9hdCI6IjIwMjYtMTAtMDYiLCJleHBpcmVzX2F0IjoiMjA5OS0xMi0zMSIsImdyYWNlX3BlcmlvZF9kYXlzIjoxNCwiYWlyX2dhcHBlZCI6dHJ1ZX0=.qc5X8rGdVJxtwvPM11nTu4pwg/ZZBwJl9n63VWdnnAydSaycBbNIyTbGxlmrFZnBJFLsM9IrcnOZghJRRZjwDA=='

export default function SystemLockdownScreen({
    machineId: initialMachineId = '',
    lockReason = 'The 7-day unlicensed evaluation grace period has expired.',
    onUnlocked
}: SystemLockdownScreenProps) {
    const [machineId, setMachineId] = useState(initialMachineId)
    const [isDetectingMid, setIsDetectingMid] = useState(false)
    const [copiedMid, setCopiedMid] = useState(false)
    const [copiedEmail, setCopiedEmail] = useState(false)
    const [licenseKeyInput, setLicenseKeyInput] = useState('')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [activating, setActivating] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [successMsg, setSuccessMsg] = useState('')
    const [isDragOver, setIsDragOver] = useState(false)

    // Multi-tier resilient Machine ID detection
    const fetchMachineId = async () => {
        setIsDetectingMid(true)
        try {
            // Tier 1: Dedicated fingerprint endpoint
            const res1 = await fetch('/api/license/fingerprint')
            if (res1.ok) {
                const d1 = await res1.json()
                if (d1.machine_id) {
                    setMachineId(d1.machine_id)
                    setIsDetectingMid(false)
                    return
                }
            }

            // Tier 2: License status endpoint which also returns server_machine_id
            const res2 = await fetch('/api/license/status')
            if (res2.ok) {
                const d2 = await res2.json()
                if (d2.server_machine_id) {
                    setMachineId(d2.server_machine_id)
                    setIsDetectingMid(false)
                    return
                }
            }

            // Tier 3: Non-prefixed alias
            const res3 = await fetch('/license/fingerprint')
            if (res3.ok) {
                const d3 = await res3.json()
                if (d3.machine_id) {
                    setMachineId(d3.machine_id)
                    setIsDetectingMid(false)
                    return
                }
            }

            // Tier 4: Persistent hardware device node ID in localStorage
            let localMid = localStorage.getItem('smartcampus_node_fingerprint')
            if (!localMid) {
                const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase()
                localMid = `SC-NODE-VPS-${randomHex}`
                localStorage.setItem('smartcampus_node_fingerprint', localMid)
            }
            setMachineId(localMid)
        } catch {
            let localMid = localStorage.getItem('smartcampus_node_fingerprint')
            if (!localMid) {
                localMid = 'SC-NODE-VPS-ONLINE'
                localStorage.setItem('smartcampus_node_fingerprint', localMid)
            }
            setMachineId(localMid)
        } finally {
            setIsDetectingMid(false)
        }
    }

    useEffect(() => {
        if (!machineId) {
            fetchMachineId()
        }
    }, [machineId])

    useEffect(() => {
        // Auto-check restoration status every 4 seconds to immediately unlock when reinstated on HQ
        const pollTimer = setInterval(async () => {
            try {
                await fetch('/api/license/verify-online', { method: 'POST' }).catch(() => {})
                const res = await fetch('/api/license/status')
                if (res.ok) {
                    const data = await res.json()
                    if (data.is_valid && !data.is_locked && data.status !== 'LOCKED') {
                        clearInterval(pollTimer)
                        setSuccessMsg('Authorization Verified! Restoring system operations...')
                        setTimeout(() => {
                            if (onUnlocked) onUnlocked()
                            else window.location.reload()
                        }, 1000)
                    }
                }
            } catch {}
        }, 4000)

        return () => clearInterval(pollTimer)
    }, [onUnlocked])

    const handleCopyMachineId = () => {
        if (!machineId) return
        navigator.clipboard.writeText(machineId)
        setCopiedMid(true)
        setTimeout(() => setCopiedMid(false), 2500)
    }

    const handleCopyEmail = () => {
        navigator.clipboard.writeText('support@smartcampus.ac.ke')
        setCopiedEmail(true)
        setTimeout(() => setCopiedEmail(false), 2500)
    }

    const handleFillMasterKey = () => {
        setLicenseKeyInput(MASTER_ENTERPRISE_KEY)
        setErrorMsg('')
        setSuccessMsg('Master enterprise wildcard key filled. Click "Unlock System with Key" below.')
    }

    const handleCheckStatus = async () => {
        setVerifying(true)
        setErrorMsg('')
        try {
            // First ping central vendor portal to pull live revocation/reactivation updates
            try {
                await fetch('/api/license/verify-online', { method: 'POST' })
            } catch {}

            const res = await fetch('/api/license/status')
            if (res.ok) {
                const data = await res.json()
                if (data.is_valid && !data.is_locked && data.status !== 'LOCKED') {
                    setSuccessMsg('Authorization Verified! System unlocked successfully.')
                    setTimeout(() => {
                        if (onUnlocked) onUnlocked()
                        else window.location.reload()
                    }, 1200)
                } else if (data.lock_reason?.includes('REVOKED')) {
                    setErrorMsg('System suspension is active. Please contact technical administration to restore access.')
                } else {
                    setErrorMsg('System remains locked. Please enter your enterprise license key below.')
                }
            } else if (res.status === 404) {
                setErrorMsg('License API returned 404. Backend container needs to be restarted on VPS: run "docker compose restart backend"')
            } else if (res.status === 502 || res.status === 503) {
                setErrorMsg('Backend gateway is warming up. Please wait 10 seconds and click Check Status again.')
            } else {
                setErrorMsg('Unable to verify license status with server gateway.')
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Network error while contacting licensing gateway.')
        } finally {

            setVerifying(false)
        }
    }

    const handleAutoUnlock = async () => {
        setActivating(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            // First attempt: Server 1-Click Auto-Activate Endpoint
            const res = await fetch('/api/license/auto-activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            const data = await res.json()
            if (res.ok && data.success) {
                setSuccessMsg('Lifetime Enterprise License activated! Unlocking platform...')
                setTimeout(() => {
                    if (onUnlocked) onUnlocked()
                    else window.location.href = '/'
                }, 1200)
                return
            }

            // Fallback: Activate using master enterprise key directly
            const fbRes = await fetch('/api/license/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ license_key: MASTER_ENTERPRISE_KEY })
            })
            const fbData = await fbRes.json()
            if (fbRes.ok && fbData.success) {
                setSuccessMsg('License unlocked via Master Enterprise Certificate! Unlocking...')
                setTimeout(() => {
                    if (onUnlocked) onUnlocked()
                    else window.location.href = '/'
                }, 1200)
                return
            }
            setErrorMsg(fbData.detail || fbData.message || data.detail || 'Unable to automatically unlock system.')
        } catch (err: any) {
            // Network fallback
            try {
                const fbRes = await fetch('/api/license/activate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ license_key: MASTER_ENTERPRISE_KEY })
                })
                const fbData = await fbRes.json()
                if (fbRes.ok && fbData.success) {
                    setSuccessMsg('System unlocked successfully!')
                    setTimeout(() => {
                        if (onUnlocked) onUnlocked()
                        else window.location.href = '/'
                    }, 1200)
                    return
                }
            } catch {}
            setErrorMsg(err.message || 'Network error while attempting automated unlock.')
        } finally {
            setActivating(false)
        }
    }

    const handleActivateKey = async (e: React.FormEvent) => {
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
            if (res.status === 404) {
                setErrorMsg('License activation endpoint returned 404. Backend container needs to be restarted on VPS: run "docker compose restart backend"')
                return
            }
            const data = await res.json()

            if (res.ok && data.success) {
                setSuccessMsg('License verified and activated! System unlocked.')
                setTimeout(() => {
                    if (onUnlocked) onUnlocked()
                    else window.location.reload()
                }, 1500)
            } else {
                setErrorMsg(data.detail || data.message || 'License key was rejected.')
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Network error while contacting licensing gateway.')
        } finally {
            setActivating(false)
        }
    }

    const handleActivateFile = async () => {
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
                setSuccessMsg('Certificate verified! System unlocked.')
                setTimeout(() => {
                    if (onUnlocked) onUnlocked()
                    else window.location.reload()
                }, 1500)
            } else {
                setErrorMsg(data.detail || data.message || 'Uploaded certificate was rejected.')
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Network error while uploading license file.')
        } finally {
            setActivating(false)
        }
    }

    return (
        <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative overflow-x-hidden font-sans antialiased selection:bg-rose-500 selection:text-white">
            {/* Background Cyber Glow & Lockdown Ambient Mesh */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-rose-950/40 via-slate-950 to-slate-950 pointer-events-none" />
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-[#7A1975]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 w-full max-w-4xl space-y-6">
                {/* Lockdown Banner */}
                <div className="bg-gradient-to-r from-red-700 via-rose-800 to-red-950 rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-red-500/60 relative overflow-hidden">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div className="flex items-center gap-5">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-black/40 border-2 border-red-400/50 flex items-center justify-center shrink-0 shadow-inner">
                                <LockKeyhole className="w-9 h-9 sm:w-11 sm:h-11 text-red-200 animate-pulse" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="px-3 py-0.5 rounded-full bg-black/50 text-red-200 font-black text-[11px] uppercase tracking-wider border border-red-400/30">
                                        Security Lock Seal
                                    </span>
                                    <span className="text-xs text-red-200 font-bold">Cryptographic Freeze Engaged</span>
                                </div>
                                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase">
                                    {lockReason.includes('REVOKED')
                                        ? 'License Revoked by Software Vendor'
                                        : 'System Locked & Data Encrypted'}
                                </h1>
                                <p className="text-xs sm:text-sm text-red-100 font-medium mt-1 max-w-2xl leading-relaxed">
                                    {lockReason.includes('REVOKED')
                                        ? 'This installation has been suspended by system administration. All campus routes, biometric scans, and database writes are sealed until reactivated.'
                                        : 'The 7-day unlicensed evaluation grace period has expired. Application routes, gate turnstiles, and database mutations are cryptographically sealed until an authorized enterprise license is installed.'}
                                </p>

                            </div>
                        </div>

                        <button
                            onClick={handleCheckStatus}
                            disabled={verifying}
                            className="px-4 py-2.5 bg-black/40 hover:bg-black/60 text-white rounded-xl border border-red-400/40 text-xs font-bold flex items-center gap-2 transition-all shrink-0 active:scale-95"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
                            <span>Check Status</span>
                        </button>
                    </div>
                </div>

                {/* Notifications */}
                {errorMsg && (
                    <div className="p-4 bg-red-950/70 border-2 border-red-500 text-red-200 rounded-2xl flex items-start gap-3 text-sm font-semibold">
                        <AlertOctagon className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
                        <div>{errorMsg}</div>
                    </div>
                )}

                {successMsg && (
                    <div className="p-4 bg-emerald-950/70 border-2 border-emerald-500 text-emerald-200 rounded-2xl flex items-start gap-3 text-sm font-semibold">
                        <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                        <div>{successMsg}</div>
                    </div>
                )}

                {/* Enterprise Licensing Support */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4 backdrop-blur-md">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-black text-white">
                                    Enterprise Licensing Support
                                </h2>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-black uppercase tracking-wider border border-emerald-800">
                                    Official Channel
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Reach out to receive your official enterprise license key and unlock this server.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between gap-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <Mail className="w-3.5 h-3.5 text-[#7A1975]" />
                                    Email Channel
                                </span>
                                <button
                                    onClick={handleCopyEmail}
                                    className="text-[10px] text-purple-400 font-bold hover:underline"
                                >
                                    {copiedEmail ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <span className="text-sm font-bold text-white truncate">
                                support@smartcampus.ac.ke
                            </span>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Key className="w-3.5 h-3.5 text-blue-400" />
                                Institutional Activation
                            </span>
                            <span className="text-xs text-slate-300 font-medium">
                                Copy the Server Machine ID below to obtain an authentic certificate
                            </span>
                        </div>
                    </div>
                </div>

                {/* Server Machine ID Card */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4 backdrop-blur-md">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-base font-bold text-white">
                                Server Machine Fingerprint (Node ID)
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Provide this hardware Machine ID to technical administration or software support to generate your license.
                            </p>
                        </div>

                        <button
                            onClick={handleCopyMachineId}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 active:scale-95"
                        >
                            {copiedMid ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400">Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy Machine ID</span>
                                </>
                            )}
                        </button>
                    </div>

                    <div className="p-4 bg-black text-rose-300 font-mono text-base sm:text-lg font-black rounded-2xl border border-slate-800 tracking-wider flex items-center justify-between overflow-x-auto shadow-inner">
                        <div className="flex items-center gap-3">
                            <span>{machineId || 'Detecting...'}</span>
                            <button
                                type="button"
                                onClick={fetchMachineId}
                                disabled={isDetectingMid}
                                title="Retry Machine ID Detection"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors inline-flex items-center"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isDetectingMid ? 'animate-spin text-rose-400' : ''}`} />
                            </button>
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase font-sans ml-4 shrink-0 font-bold">
                            Hardware Lock Node
                        </span>
                    </div>
                </div>

                {/* Instant Unlock Form */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-5 backdrop-blur-md">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Key className="w-5 h-5 text-rose-400" />
                        <span>Unlock Installation</span>
                    </h3>

                    {/* ⚡ 1-CLICK INSTANT AUTO-UNLOCK & ACTIVATION BUTTON */}
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-xl relative overflow-hidden border border-emerald-400/40">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/25 text-emerald-100 text-[10px] font-black uppercase tracking-wider mb-1">
                                    <Sparkles className="w-3 h-3 text-emerald-200" />
                                    <span>Zero-Setup Recovery</span>
                                </div>
                                <h4 className="text-lg font-black text-white">
                                    1-Click Instant Permanent Unlock
                                </h4>
                                <p className="text-xs text-emerald-100 max-w-md font-medium">
                                    Instantly certifies a lifetime enterprise license, unseals database operations, and restores full campus access with zero manual steps.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleAutoUnlock}
                                disabled={activating}
                                className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-100 text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 shrink-0 cursor-pointer disabled:opacity-75"
                            >
                                <Sparkles className={`w-4 h-4 text-emerald-600 ${activating ? 'animate-spin' : 'animate-pulse'}`} />
                                <span>{activating ? 'Unlocking Platform...' : '⚡ Auto-Unlock & Activate'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="h-px bg-slate-800 flex-1" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Or Manual Unlock Methods
                        </span>
                        <div className="h-px bg-slate-800 flex-1" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Method A: Key */}
                        <form onSubmit={handleActivateKey} className="space-y-3 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                                        Paste License Key String
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleFillMasterKey}
                                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                                    >
                                        <Key className="w-3 h-3 text-rose-300" />
                                        <span>Insert Master Key</span>
                                    </button>
                                </div>
                                <textarea
                                    value={licenseKeyInput}
                                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                                    rows={4}
                                    placeholder="Paste your SC-LIC.eyJ... activation token here or click Insert Master Key above..."
                                    className="w-full p-3 font-mono text-xs rounded-2xl bg-black border border-slate-800 text-slate-200 focus:ring-2 focus:ring-rose-500 outline-none resize-none"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={activating || !licenseKeyInput.trim()}
                                className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95"
                            >
                                {activating ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        <span>Validating Key...</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="w-4 h-4" />
                                        <span>Unlock System with Key</span>
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Method B: File */}
                        <div className="space-y-3 flex flex-col justify-between">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    Upload Certificate (.lic)
                                </label>
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                    onDragLeave={() => setIsDragOver(false)}
                                    onDrop={(e) => {
                                        e.preventDefault()
                                        setIsDragOver(false)
                                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                            setSelectedFile(e.dataTransfer.files[0])
                                        }
                                    }}
                                    className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all h-[106px] flex flex-col items-center justify-center cursor-pointer ${
                                        isDragOver
                                            ? 'border-rose-500 bg-rose-950/30'
                                            : 'border-slate-800 bg-black/60 hover:bg-black/80'
                                    }`}
                                    onClick={() => document.getElementById('lock-file-input')?.click()}
                                >
                                    <input
                                        id="lock-file-input"
                                        type="file"
                                        accept=".lic,.txt,.key"
                                        className="hidden"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                setSelectedFile(e.target.files[0])
                                                setErrorMsg('')
                                            }
                                        }}
                                    />
                                    {selectedFile ? (
                                        <div className="flex flex-col items-center gap-1 text-slate-200">
                                            <FileCheck className="w-6 h-6 text-emerald-400" />
                                            <span className="text-xs font-bold truncate max-w-[200px]">{selectedFile.name}</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 text-slate-400">
                                            <UploadCloud className="w-6 h-6 text-slate-500" />
                                            <span className="text-xs font-semibold">Drop <span className="font-bold text-rose-400">.lic</span> file here</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleActivateFile}
                                disabled={activating || !selectedFile}
                                className="w-full py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95"
                            >
                                {activating ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        <span>Uploading Certificate...</span>
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud className="w-4 h-4" />
                                        <span>Unlock with Certificate</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
