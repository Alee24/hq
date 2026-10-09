import React, { useState, useEffect } from 'react'
import {
    LockKeyhole, Copy, Check, RefreshCw, Key,
    UploadCloud, FileCheck, Phone, Mail, Globe,
    ShieldCheck, AlertOctagon, User, ExternalLink
} from 'lucide-react'

interface SystemLockdownScreenProps {
    machineId?: string
    lockReason?: string
    onUnlocked?: () => void
}

export default function SystemLockdownScreen({
    machineId: initialMachineId = '',
    lockReason = 'The 7-day unlicensed evaluation grace period has expired.',
    onUnlocked
}: SystemLockdownScreenProps) {
    const [machineId, setMachineId] = useState(initialMachineId)
    const [isDetectingMid, setIsDetectingMid] = useState(false)
    const [copiedMid, setCopiedMid] = useState(false)
    const [copiedEmail, setCopiedEmail] = useState(false)
    const [copiedPhone, setCopiedPhone] = useState(false)
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
        navigator.clipboard.writeText('mettoalex@gmail.com')
        setCopiedEmail(true)
        setTimeout(() => setCopiedEmail(false), 2500)
    }

    const handleCopyPhone = () => {
        navigator.clipboard.writeText('+254 724 454 757')
        setCopiedPhone(true)
        setTimeout(() => setCopiedPhone(false), 2500)
    }

    const handleCheckStatus = async () => {
        setVerifying(true)
        setErrorMsg('')
        try {
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
                    setErrorMsg('System remains locked. Please enter an authentic valid enterprise license below.')
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
                setErrorMsg(data.detail || data.message || 'License key verification failed. Only an authentic valid license matching this machine node can unlock this system.')
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
                setErrorMsg(data.detail || data.message || 'Uploaded certificate was rejected. Please ensure the file is an authentic .lic certificate issued for this node.')
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
                                        ? 'This installation has been suspended by system administration. All campus routes, biometric scans, and database writes are sealed until reactivated with a valid license.'
                                        : 'The unlicensed evaluation grace period has expired. Application routes, gate turnstiles, and database mutations are cryptographically sealed until an authorized enterprise license is installed.'}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleCheckStatus}
                            disabled={verifying}
                            className="px-4 py-2.5 bg-black/40 hover:bg-black/60 text-white rounded-xl border border-red-400/40 text-xs font-bold flex items-center gap-2 transition-all shrink-0 active:scale-95 cursor-pointer"
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

                {/* Server Machine ID Card */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4 backdrop-blur-md">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-base font-bold text-white">
                                Server Machine Fingerprint
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Provide this hardware Machine ID to the software developer to generate your authentic digitally signed license.
                            </p>
                        </div>

                        <button
                            onClick={handleCopyMachineId}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 active:scale-95 cursor-pointer"
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
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors inline-flex items-center cursor-pointer"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isDetectingMid ? 'animate-spin text-rose-400' : ''}`} />
                            </button>
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase font-sans ml-4 shrink-0 font-bold">
                            Hardware Lock Node
                        </span>
                    </div>
                </div>

                {/* Software Developer & Official Support Card */}
                <div className="bg-slate-900/95 border-2 border-purple-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4 backdrop-blur-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 relative z-10">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full bg-purple-950 text-purple-300 text-[10px] font-black uppercase tracking-wider border border-purple-800">
                                    Official Licensing Authority
                                </span>
                                <span className="text-xs text-slate-400 font-medium">Software Developer Verification</span>
                            </div>
                            <h2 className="text-xl font-black text-white mt-1">
                                Software Developer & Technical Support
                            </h2>
                            <p className="text-xs text-slate-300 mt-0.5">
                                Only an authentic, cryptographically signed enterprise license issued by the software developer can unlock this installation. Contact the developer with your <strong className="text-rose-300">Server Machine Fingerprint</strong> to receive your authorized license certificate.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10">
                        {/* Developer Info */}
                        <div className="p-4 rounded-2xl bg-black/60 border border-slate-800 flex flex-col justify-between gap-2 shadow-inner">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <User className="w-4 h-4 text-purple-400" />
                                Software Developer
                            </span>
                            <div>
                                <span className="text-sm font-black text-white block">
                                    Alex Metto
                                </span>
                                <span className="text-[11px] text-purple-300 font-medium block">
                                    KKDES Software Solutions
                                </span>
                            </div>
                        </div>

                        {/* Email Channel */}
                        <div className="p-4 rounded-2xl bg-black/60 border border-slate-800 flex flex-col justify-between gap-2 shadow-inner">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <Mail className="w-4 h-4 text-emerald-400" />
                                    Email Channel
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCopyEmail}
                                    className="text-[10px] text-purple-400 font-bold hover:underline cursor-pointer"
                                >
                                    {copiedEmail ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <div>
                                <a
                                    href="mailto:mettoalex@gmail.com"
                                    className="text-sm font-black text-white hover:text-emerald-400 transition-colors truncate block"
                                >
                                    mettoalex@gmail.com
                                </a>
                                <span className="text-[11px] text-slate-400 font-medium block">
                                    Official Licensing Desk
                                </span>
                            </div>
                        </div>

                        {/* Phone & WhatsApp */}
                        <div className="p-4 rounded-2xl bg-black/60 border border-slate-800 flex flex-col justify-between gap-2 shadow-inner">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <Phone className="w-4 h-4 text-blue-400" />
                                    Phone & WhatsApp
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCopyPhone}
                                    className="text-[10px] text-purple-400 font-bold hover:underline cursor-pointer"
                                >
                                    {copiedPhone ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href="tel:+254724454757"
                                        className="text-sm font-black text-white hover:text-blue-400 transition-colors"
                                    >
                                        +254 724 454 757
                                    </a>
                                    <a
                                        href="https://wa.me/254724454757"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-black border border-emerald-800 hover:bg-emerald-900 transition-colors"
                                    >
                                        WhatsApp
                                    </a>
                                </div>
                                <span className="text-[11px] text-slate-400 font-medium block">
                                    Direct Support Line
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Strict License Unlock Form (Only Valid License Key or .LIC Certificate) */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-5 backdrop-blur-md">
                    <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <Key className="w-5 h-5 text-rose-400" />
                            <span>Unlock Installation</span>
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            Only an authentic, digitally signed enterprise license issued for this hardware node can unlock this platform.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Method A: Cryptographic Key String */}
                        <form onSubmit={handleActivateKey} className="space-y-3 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                                        License Key String
                                    </label>
                                </div>
                                <textarea
                                    value={licenseKeyInput}
                                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                                    rows={4}
                                    placeholder="Paste your cryptographically signed license key string here..."
                                    className="w-full p-3 font-mono text-xs rounded-2xl bg-black border border-slate-800 text-slate-200 focus:ring-2 focus:ring-rose-500 outline-none resize-none"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={activating || !licenseKeyInput.trim()}
                                className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                            >
                                {activating ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        <span>Validating Key...</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="w-4 h-4" />
                                        <span>Unlock with Key</span>
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Method B: Certificate File (.lic) */}
                        <div className="space-y-3 flex flex-col justify-between">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                                    Certificate File (.lic)
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
                                            <span className="text-xs font-semibold">Drop <span className="font-bold text-rose-400">.lic</span> file here or click to browse</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleActivateFile}
                                disabled={activating || !selectedFile}
                                className="w-full py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
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

                    <div className="p-3 bg-black/40 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                        <span>
                            Security Notice: Cryptographic validation is strictly enforced. Unsigned, expired, or tampered keys will fail verification and maintain platform seal.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
