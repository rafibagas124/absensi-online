// ==========================================================================
// security.js — AbsensiPro Enterprise Security Engine
// Rate Limiting, Input Sanitization, CSRF Defense, Audit Logging, Sentry, Webhooks & Backups
// ==========================================================================
(function (global) {
    'use strict';

    // ──────────────────────────────────────────────────────────────────────────
    // 1. INPUT SANITIZATION & VALIDATION ENGINE
    // ──────────────────────────────────────────────────────────────────────────
    const SecuritySanitizer = {
        /**
         * Escape HTML & XSS vectors safely
         */
        escapeHtml: function (str) {
            if (typeof str !== 'string') return str === null || str === undefined ? '' : String(str);
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;')
                .replace(/\//g, '&#x2F;');
        },

        /**
         * Sanitize string: strip script tags, dangerous protocols, inline event handlers, and control characters
         */
        sanitizeText: function (str, maxLen = 255) {
            if (str === null || str === undefined) return '';
            let cleaned = String(str).trim();
            // Strip null bytes and non-printable control characters (except newline/tab)
            cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            // Strip dangerous protocols & inline script tags
            cleaned = cleaned.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
            cleaned = cleaned.replace(/javascript\s*:/gi, '');
            cleaned = cleaned.replace(/vbscript\s*:/gi, '');
            cleaned = cleaned.replace(/data\s*:\s*text\/html/gi, '');
            cleaned = cleaned.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
            cleaned = cleaned.replace(/on\w+\s*=\s*[^>\s]+/gi, '');
            // Truncate to maximum length
            return cleaned.substring(0, maxLen);
        },

        /**
         * Strict Email Validation (RFC 5322 subset)
         */
        validateEmail: function (email) {
            if (!email || typeof email !== 'string') return false;
            const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
            return re.test(email.trim()) && email.length <= 150;
        },

        /**
         * Company Code validation (alphanumeric + hyphens, 3-30 chars)
         */
        validateCompanyCode: function (code) {
            if (!code || typeof code !== 'string') return false;
            return /^[A-Z0-9\-]{3,30}$/.test(code.trim().toUpperCase());
        },

        /**
         * Employee ID validation (alphanumeric + hyphens/slashes/dots, 2-50 chars)
         */
        validateEmployeeId: function (id) {
            if (!id || typeof id !== 'string') return false;
            return /^[A-Za-z0-9\-\.\/_]{2,50}$/.test(id.trim());
        },

        /**
         * Validate GPS Coordinate ranges & accuracy
         */
        validateCoordinates: function (lat, lng, accuracy = null) {
            const latitude = parseFloat(lat);
            const longitude = parseFloat(lng);
            if (isNaN(latitude) || isNaN(longitude)) return false;
            if (latitude < -90 || latitude > 90) return false;
            if (longitude < -180 || longitude > 180) return false;
            if (accuracy !== null) {
                const acc = parseFloat(accuracy);
                if (isNaN(acc) || acc < 0 || acc > 10000) return false;
            }
            return true;
        },

        /**
         * Validate file upload (size, MIME type, allowed extensions)
         */
        validateFileUpload: function (file, allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], maxSizeBytes = 5 * 1024 * 1024) {
            if (!file) return { valid: false, message: 'Tidak ada file yang dipilih.' };
            if (file.size > maxSizeBytes) {
                return { valid: false, message: 'Ukuran file melebihi batas maksimal 5MB.' };
            }
            const fileType = (file.type || '').toLowerCase();
            const fileName = (file.name || '').toLowerCase();
            const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
            const hasValidExt = allowedExts.some(ext => fileName.endsWith(ext));
            const hasValidMime = allowedTypes.includes(fileType);

            if (!hasValidExt || !hasValidMime) {
                return { valid: false, message: 'Format file tidak diizinkan. Hanya JPG, PNG, WEBP, atau PDF.' };
            }
            return { valid: true, message: 'File valid.' };
        },

        /**
         * Validate password strength
         */
        validatePasswordStrength: function (pwd) {
            if (!pwd || typeof pwd !== 'string') return { valid: false, score: 0, message: 'Password tidak boleh kosong.' };
            if (pwd.length < 6) return { valid: false, score: 1, message: 'Password minimal 6 karakter.' };
            let score = 0;
            if (pwd.length >= 8) score++;
            if (/[A-Z]/.test(pwd)) score++;
            if (/[0-9]/.test(pwd)) score++;
            if (/[^A-Za-z0-9]/.test(pwd)) score++;
            return { valid: true, score: score, isStrong: score >= 3 };
        }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 2. RATE LIMITING & ANTI BRUTE-FORCE CONTROLLER
    // ──────────────────────────────────────────────────────────────────────────
    const RateLimiter = {
        STORAGE_KEY: '__absensi_rate_limits',

        _getStore: function () {
            try {
                const data = localStorage.getItem(this.STORAGE_KEY);
                return data ? JSON.parse(data) : {};
            } catch (e) {
                return {};
            }
        },

        _saveStore: function (store) {
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(store));
            } catch (e) {}
        },

        /**
         * Check if action is currently allowed
         */
        checkLimit: function (action, identifier = 'default', maxAttempts = 5, windowSeconds = 300, lockoutSeconds = 60) {
            const key = action + ':' + String(identifier).toLowerCase();
            const store = this._getStore();
            const now = Date.now();
            const record = store[key] || { attempts: [], lockoutUntil: 0 };

            if (record.lockoutUntil && record.lockoutUntil > now) {
                const remainingSecs = Math.ceil((record.lockoutUntil - now) / 1000);
                return {
                    allowed: false,
                    remainingSeconds: remainingSecs,
                    message: `Terlalu banyak percobaan gagal. Silakan coba lagi dalam ${remainingSecs} detik.`
                };
            }

            const windowMs = windowSeconds * 1000;
            record.attempts = (record.attempts || []).filter(ts => now - ts < windowMs);

            if (record.attempts.length >= maxAttempts) {
                record.lockoutUntil = now + (lockoutSeconds * 1000);
                store[key] = record;
                this._saveStore(store);

                SecurityLogger.log({
                    eventType: 'BRUTE_FORCE_LOCKOUT',
                    severity: 'WARNING',
                    details: { action, identifier, attempts: record.attempts.length, lockoutSeconds }
                });

                return {
                    allowed: false,
                    remainingSeconds: lockoutSeconds,
                    message: `Batas percobaan (${maxAttempts}x) terlampaui. Akses dikunci sementara selama ${lockoutSeconds} detik.`
                };
            }

            return { allowed: true, remainingAttempts: maxAttempts - record.attempts.length };
        },

        /**
         * Record a failed attempt
         */
        recordFailure: function (action, identifier = 'default', maxAttempts = 5, windowSeconds = 300, lockoutSeconds = 60) {
            const key = action + ':' + String(identifier).toLowerCase();
            const store = this._getStore();
            const now = Date.now();
            const record = store[key] || { attempts: [], lockoutUntil: 0 };

            const windowMs = windowSeconds * 1000;
            record.attempts = (record.attempts || []).filter(ts => now - ts < windowMs);
            record.attempts.push(now);

            if (record.attempts.length >= maxAttempts) {
                const multiplier = Math.floor(record.attempts.length / maxAttempts);
                const actualLockout = lockoutSeconds * Math.min(multiplier, 10);
                record.lockoutUntil = now + (actualLockout * 1000);

                SecurityLogger.log({
                    eventType: 'BRUTE_FORCE_SPIKE',
                    severity: 'CRITICAL',
                    details: { action, identifier, totalAttempts: record.attempts.length, lockoutSeconds: actualLockout }
                });
            }

            store[key] = record;
            this._saveStore(store);
            return record.attempts.length;
        },

        /**
         * Record success and reset failure counters
         */
        recordSuccess: function (action, identifier = 'default') {
            const key = action + ':' + String(identifier).toLowerCase();
            const store = this._getStore();
            if (store[key]) {
                delete store[key];
                this._saveStore(store);
            }
        },

        /**
         * Clear all rate limits (Admin only)
         */
        clearAll: function () {
            try {
                localStorage.removeItem(this.STORAGE_KEY);
            } catch (e) {}
        }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 3. CSRF & REQUEST INTEGRITY GUARD
    // ──────────────────────────────────────────────────────────────────────────
    const CsrfGuard = {
        TOKEN_KEY: '__absensi_csrf_token',

        getToken: function () {
            let token = sessionStorage.getItem(this.TOKEN_KEY);
            if (!token) {
                const arr = new Uint8Array(24);
                if (window.crypto && window.crypto.getRandomValues) {
                    window.crypto.getRandomValues(arr);
                } else {
                    for (let i = 0; i < 24; i++) arr[i] = Math.floor(Math.random() * 256);
                }
                token = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
                sessionStorage.setItem(this.TOKEN_KEY, token);
            }
            return token;
        },

        validateToken: function (incomingToken) {
            const current = this.getToken();
            return typeof incomingToken === 'string' && incomingToken.length === current.length && incomingToken === current;
        },

        validateOrigin: function () {
            try {
                const currentOrigin = window.location.origin;
                return currentOrigin.startsWith('http://') || currentOrigin.startsWith('https://');
            } catch (e) {
                return false;
            }
        },

        attachHeaders: function (headers = {}) {
            return {
                ...headers,
                'X-Absensi-CSRF': this.getToken(),
                'X-Requested-With': 'XMLHttpRequest'
            };
        }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 4. REAL-TIME SECURITY AUDIT LOGGING, SENTRY & WEBHOOKS
    // ──────────────────────────────────────────────────────────────────────────
    const SecurityLogger = {
        LOCAL_AUDIT_KEY: '__absensi_audit_logs',
        WEBHOOK_CONFIG_KEY: '__absensi_webhook_config',
        SENTRY_CONFIG_KEY: '__absensi_sentry_dsn',

        _sentryInitialized: false,

        /**
         * Initialize Sentry if configured
         */
        initSentry: function (customDsn = null) {
            const dsn = customDsn || localStorage.getItem(this.SENTRY_CONFIG_KEY);
            if (!dsn || this._sentryInitialized) return;

            if (typeof window.Sentry !== 'undefined' && window.Sentry.init) {
                try {
                    window.Sentry.init({
                        dsn: dsn,
                        integrations: [
                            new window.Sentry.BrowserTracing(),
                            new window.Sentry.Replay({ maskAllText: false, blockAllMedia: false })
                        ],
                        tracesSampleRate: 0.2,
                        replaysSessionSampleRate: 0.1,
                        replaysOnErrorSampleRate: 1.0,
                    });
                    this._sentryInitialized = true;
                    console.log('[SecurityLogger] Sentry initialized successfully.');
                } catch (err) {
                    console.warn('[SecurityLogger] Sentry init warning:', err);
                }
            }
        },

        setSentryDsn: function (dsn) {
            if (dsn) {
                localStorage.setItem(this.SENTRY_CONFIG_KEY, dsn.trim());
                this.initSentry(dsn.trim());
            } else {
                localStorage.removeItem(this.SENTRY_CONFIG_KEY);
            }
        },

        getSentryDsn: function () {
            return localStorage.getItem(this.SENTRY_CONFIG_KEY) || '';
        },

        setWebhookUrl: function (url) {
            if (url) {
                localStorage.setItem(this.WEBHOOK_CONFIG_KEY, url.trim());
            } else {
                localStorage.removeItem(this.WEBHOOK_CONFIG_KEY);
            }
        },

        getWebhookUrl: function () {
            return localStorage.getItem(this.WEBHOOK_CONFIG_KEY) || '';
        },

        /**
         * Main log & alerting dispatcher
         */
        log: function ({ eventType, severity = 'INFO', details = {}, companyId = null, userId = null }) {
            const timestamp = new Date().toISOString();
            const logEntry = {
                id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                timestamp: timestamp,
                eventType: eventType,
                severity: severity,
                companyId: companyId || (window.currentUser ? window.currentUser.company_id : null),
                userId: userId || (window.currentUser ? (window.currentUser.employee_id || window.currentUser.id) : null),
                userEmail: window.currentUser ? window.currentUser.email : (details && details.email ? details.email : null),
                userAgent: typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent.substring(0, 150) : '',
                details: details
            };

            // 1. Simpan ke Cache Lokal
            try {
                const logs = this.getLocalLogs();
                logs.unshift(logEntry);
                if (logs.length > 200) logs.pop();
                localStorage.setItem(this.LOCAL_AUDIT_KEY, JSON.stringify(logs));
            } catch (e) {}

            // 2. Simpan ke Supabase Database jika ada
            if (typeof sb !== 'undefined' && sb && sb.from && logEntry.companyId) {
                sb.from('security_audit_logs').insert([{
                    company_id: logEntry.companyId,
                    event_type: logEntry.eventType,
                    severity: logEntry.severity,
                    user_email: logEntry.userEmail,
                    user_agent: logEntry.userAgent,
                    details: logEntry.details
                }]).then(() => {}).catch(() => {});
            }

            // 3. Teruskan ke Sentry jika ada anomali atau CRITICAL
            if (typeof window.Sentry !== 'undefined' && window.Sentry.captureMessage) {
                if (severity === 'CRITICAL' || severity === 'WARNING') {
                    window.Sentry.captureMessage(`[${severity}] ${eventType}: ${JSON.stringify(details)}`, {
                        level: severity === 'CRITICAL' ? 'fatal' : 'warning',
                        extra: logEntry
                    });
                }
            }

            // 4. Dispatch Alert (In-App + Webhook)
            if (severity === 'CRITICAL' || severity === 'WARNING') {
                this.dispatchAlert(logEntry);
            }

            return logEntry;
        },

        getLocalLogs: function () {
            try {
                const raw = localStorage.getItem(this.LOCAL_AUDIT_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        },

        clearLocalLogs: function () {
            try {
                localStorage.removeItem(this.LOCAL_AUDIT_KEY);
            } catch (e) {}
        },

        dispatchAlert: function (logEntry) {
            // In-app Alert Badge
            if (window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'hrd') && typeof window.showSecurityAlertBadge === 'function') {
                window.showSecurityAlertBadge(logEntry);
            }

            // Webhook Notification (Discord / Slack / Telegram / Custom Webhook)
            const webhookUrl = this.getWebhookUrl();
            if (webhookUrl && (webhookUrl.startsWith('http://') || webhookUrl.startsWith('https://'))) {
                this._sendWebhook(webhookUrl, logEntry);
            }
        },

        _sendWebhook: function (url, logEntry) {
            try {
                let payload = {};
                // Format Discord
                if (url.includes('discord.com/api/webhooks')) {
                    payload = {
                        content: `🚨 **[ABSENSIPRO SECURITY ALERT]**\n**Event:** \`${logEntry.eventType}\`\n**Severity:** **${logEntry.severity}**\n**User/Target:** \`${logEntry.userEmail || '-'}\`\n**Waktu:** ${logEntry.timestamp}\n**Detail:** \`\`\`json\n${JSON.stringify(logEntry.details, null, 2)}\n\`\`\``
                    };
                }
                // Format Slack
                else if (url.includes('slack.com')) {
                    payload = {
                        text: `🚨 *[ABSENSIPRO SECURITY ALERT]*\n*Event:* \`${logEntry.eventType}\` (${logEntry.severity})\n*User:* ${logEntry.userEmail || '-'}\n\`\`\`${JSON.stringify(logEntry.details)}\`\`\``
                    };
                }
                // Format Telegram Webhook / Generic
                else {
                    payload = {
                        title: `[SECURITY ALERT] ${logEntry.eventType}`,
                        severity: logEntry.severity,
                        event: logEntry.eventType,
                        user: logEntry.userEmail,
                        time: logEntry.timestamp,
                        details: logEntry.details
                    };
                }

                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }).catch(() => {});
            } catch (e) {}
        }
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 5. AUTOMATED & ISOLATED DATABASE BACKUP ENGINE
    // ──────────────────────────────────────────────────────────────────────────
    const BackupEngine = {
        /**
         * Generate a comprehensive multi-tenant backup snapshot
         */
        createBackupSnapshot: async function (companyId, companyNama = 'Company') {
            if (!companyId) throw new Error('Company ID diperlukan untuk backup.');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPayload = {
                metadata: {
                    version: '2.0-SaaS',
                    backupDate: new Date().toISOString(),
                    companyId: companyId,
                    companyName: companyNama,
                    generator: 'AbsensiPro Enterprise Backup Engine'
                },
                tables: {
                    profiles: [],
                    attendance_logs: [],
                    office_locations: [],
                    shift_configs: [],
                    audit_logs: []
                }
            };

            if (typeof sbGetUsers === 'function') {
                try { backupPayload.tables.profiles = await sbGetUsers(); } catch (e) {}
            }
            if (typeof sbGetAttendanceLogs === 'function') {
                try { backupPayload.tables.attendance_logs = await sbGetAttendanceLogs({ companyId }); } catch (e) {}
            }
            if (typeof sbGetOfficeLocations === 'function') {
                try { backupPayload.tables.office_locations = await sbGetOfficeLocations(companyId); } catch (e) {}
            }
            if (typeof sbGetShiftConfigs === 'function') {
                try { backupPayload.tables.shift_configs = await sbGetShiftConfigs(companyId); } catch (e) {}
            }
            backupPayload.tables.audit_logs = SecurityLogger.getLocalLogs().filter(l => l.companyId === companyId);

            SecurityLogger.log({
                eventType: 'BACKUP_CREATED',
                severity: 'INFO',
                details: {
                    totalUsers: backupPayload.tables.profiles.length,
                    totalLogs: backupPayload.tables.attendance_logs.length,
                    totalOffices: backupPayload.tables.office_locations.length
                },
                companyId: companyId
            });

            const cleanName = String(companyNama).replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `backup_${cleanName}_${timestamp}.json`;

            return {
                fileName: fileName,
                data: backupPayload,
                jsonString: JSON.stringify(backupPayload, null, 2)
            };
        },

        /**
         * Trigger download to client device
         */
        downloadBackup: function (fileName, jsonString) {
            const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        },

        /**
         * Inspect and validate snapshot JSON
         */
        inspectBackupJson: function (jsonStr) {
            try {
                const parsed = JSON.parse(jsonStr);
                if (!parsed || !parsed.metadata || !parsed.tables) {
                    return { valid: false, message: 'Format file backup tidak valid (metadata/tables hilang).' };
                }
                return {
                    valid: true,
                    companyName: parsed.metadata.companyName || '-',
                    companyId: parsed.metadata.companyId || '-',
                    backupDate: parsed.metadata.backupDate || '-',
                    totalUsers: (parsed.tables.profiles || []).length,
                    totalLogs: (parsed.tables.attendance_logs || []).length,
                    totalOffices: (parsed.tables.office_locations || []).length,
                    totalShifts: (parsed.tables.shift_configs || []).length
                };
            } catch (err) {
                return { valid: false, message: 'Gagal membaca file JSON: ' + err.message };
            }
        }
    };

    // Export to global scope
    global.SecuritySanitizer = SecuritySanitizer;
    global.RateLimiter = RateLimiter;
    global.CsrfGuard = CsrfGuard;
    global.SecurityLogger = SecurityLogger;
    global.BackupEngine = BackupEngine;

})(typeof window !== 'undefined' ? window : global);
