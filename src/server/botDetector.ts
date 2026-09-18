/**
 * Vintage Vibes Automated Bot Detection & Security Sentinel Engine
 * Analyzes incoming request headers, user-agents, honeypot traps, attack paths,
 * and malicious payloads to instantly quarantine bad actors and record forensics in PostgreSQL.
 */

export type BotClassification = 'HUMAN' | 'VERIFIED_BOT' | 'BAD_BOT';

export interface BotAnalysisResult {
  isBadBot: boolean;
  isVerifiedBot: boolean;
  classification: BotClassification;
  botName: string;
  reason?: string;
  threatType?: string;
  threatLevel: 'NONE' | 'LOW' | 'CRITICAL';
  isHoneypotHit?: boolean;
}

export interface ThreatForensicPayload {
  ip: string;
  country?: string;
  ispOrg?: string;
  userAgent: string;
  method: string;
  url: string;
  headers: Record<string, any>;
  rawPayload?: string;
  threatType: string;
  reason?: string;
}

// Known legitimate search engine indexers and uptime monitors
const VERIFIED_BOT_PATTERNS = [
  { pattern: /googlebot/i, name: 'Googlebot' },
  { pattern: /bingbot/i, name: 'Bingbot' },
  { pattern: /baiduspider/i, name: 'Baidu Spider' },
  { pattern: /yandexbot/i, name: 'Yandex Bot' },
  { pattern: /duckduckbot/i, name: 'DuckDuckGo Bot' },
  { pattern: /slurp/i, name: 'Yahoo Slurp' },
  { pattern: /facebookexternalhit/i, name: 'Facebook Meta Bot' },
  { pattern: /facebot/i, name: 'Facebook Facebot' },
  { pattern: /twitterbot/i, name: 'Twitter / X Bot' },
  { pattern: /linkedinbot/i, name: 'LinkedIn Bot' },
  { pattern: /pinterestbot/i, name: 'Pinterest Bot' },
  { pattern: /applebot/i, name: 'Applebot' },
  { pattern: /vercel(-screenshot|bot)?/i, name: 'Vercel Deployment / Ping' },
  { pattern: /uptimerobot/i, name: 'UptimeRobot Monitor' },
  { pattern: /pingdom/i, name: 'Pingdom Health Probe' }
];

// Malicious scrapers, automated exploitation tools, and headless scrapers
const BAD_BOT_PATTERNS = [
  { pattern: /python-requests/i, name: 'Python Requests Scraper', reason: 'Automated Python HTTP scraper' },
  { pattern: /aiohttp/i, name: 'AIOHTTP Scraper', reason: 'Asynchronous Python scraper' },
  { pattern: /urllib/i, name: 'Python urllib Crawler', reason: 'Standard Python automated crawler' },
  { pattern: /wget\//i, name: 'Wget Downloader', reason: 'Automated terminal Wget scraper' },
  { pattern: /scrapy/i, name: 'Scrapy Crawler Engine', reason: 'Aggressive distributed web scraper' },
  { pattern: /puppeteer/i, name: 'Puppeteer Headless Browser', reason: 'Headless Chrome browser automation' },
  { pattern: /playwright/i, name: 'Playwright Automation', reason: 'Headless multi-browser test driver' },
  { pattern: /selenium/i, name: 'Selenium WebDriver', reason: 'Automated browser control tool' },
  { pattern: /webdriver/i, name: 'Generic WebDriver', reason: 'Automated browser driver signature' },
  { pattern: /phantomjs/i, name: 'PhantomJS Headless', reason: 'Headless WebKit automation script' },
  { pattern: /headlesschrome/i, name: 'Headless Chrome', reason: 'Browser running without graphical display' },
  { pattern: /go-http-client/i, name: 'Go HTTP Client', reason: 'Golang automated scraper script' },
  { pattern: /java\//i, name: 'Java HTTP Client', reason: 'Java automated crawling agent' },
  { pattern: /apache-httpclient/i, name: 'Apache HttpClient', reason: 'Automated Java crawler framework' },
  { pattern: /okhttp/i, name: 'OkHttp Client', reason: 'Automated OkHttp bot' },
  { pattern: /libwww-perl/i, name: 'Perl Libwww', reason: 'Perl automated scraping bot' },
  { pattern: /zgrab/i, name: 'ZGrab Banner Grabber', reason: 'Vulnerability network scanner' },
  { pattern: /sqlmap/i, name: 'SQLMap Exploitation Tool', reason: 'Automated SQL Injection attack framework' },
  { pattern: /nikto/i, name: 'Nikto Web Scanner', reason: 'Vulnerability exploit scanner' },
  { pattern: /masscan/i, name: 'Masscan Port Scanner', reason: 'High-speed network exploit tool' },
  { pattern: /nmap/i, name: 'Nmap Security Scanner', reason: 'Port scan & banner probe' },
  { pattern: /dirbuster|gobuster/i, name: 'Path Enumerator', reason: 'Brute-force directory traversal tool' },
  { pattern: /censys|shodan/i, name: 'Internet Asset Scanner', reason: 'Automated IoT reconnaissance crawler' },
  { pattern: /acunetix|nessus|qualys/i, name: 'Security Vulnerability Scanner', reason: 'Automated penetration scan tool' }
];

// Honeypot & Attack Path Traps
const HONEYPOT_TRAP_PATHS = [
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.env.backup',
  '/.env.save',
  '/vendor/.env',
  '/.git',
  '/.git/config',
  '/.git/head',
  '/.aws',
  '/.vscode',
  '/.ds_store',
  '/wp-admin',
  '/wp-login.php',
  '/wp-content',
  '/wp-includes',
  '/xmlrpc.php',
  '/phpmyadmin',
  '/pma',
  '/config.json',
  '/database.sql',
  '/dump.sql',
  '/backup.sql',
  '/server-status',
  '/actuator',
  '/solr',
  '/eval-stdin.php',
  '/etc/passwd',
  '/web.config',
  '/.svn',
  '/phpinfo.php',
  '/debug/default/view',
  '/console',
  '/telescope',
  '/autodiscover',
  '/setup.php',
  '/install.php',
  '/shell.php'
];

// Attack patterns (SQL Injection, Directory Traversal, RCE/Shell probes)
const ATTACK_SIGNATURES = [
  {
    regex: /(\bunion\b[\s\+]+.*[\s\+]*\bselect\b|\bselect\b[\s\+]+.*[\s\+]*\bfrom\b[\s\+]+(users|information_schema|pg_catalog|sys\.tables)|benchmark\s*\(|waitfor\s+delay)/i,
    name: 'SQL Injection Signature',
    threatType: 'SQL_INJECTION'
  },
  {
    regex: /(\.\.[\/\\]|\%2e\%2e[\/\\]|\%252e\%252e|\/etc\/passwd|\/windows\/win\.ini)/i,
    name: 'Directory Traversal Attempt',
    threatType: 'DIRECTORY_TRAVERSAL'
  },
  {
    regex: /(<script[\s\>]|javascript:|base64_decode\s*\(|eval\s*\(|system\s*\(|passthru\s*\(|\/bin\/sh|\/bin\/bash|cmd\.exe|powershell\.exe)/i,
    name: 'Remote Code / Script Probe',
    threatType: 'RCE_PROBE'
  }
];

// Active in-memory blacklist of quarantined IPs
const quarantinedIpsSet = new Set<string>();

// In-memory rate tracker for rapid query loops (IP -> timestamps[])
const rateTracker = new Map<string, number[]>();

export const BotDetector = {
  /**
   * Check if IP is currently quarantined by the Sentinel
   */
  isQuarantined(ip: string): boolean {
    if (!ip || ip === '127.0.0.1' || ip === 'localhost' || ip === '::1' || ip === '39.51.46.64') return false;
    return quarantinedIpsSet.has(ip);
  },

  /**
   * Instantly ban and quarantine an IP address
   */
  quarantineIp(ip: string) {
    if (ip && ip !== '127.0.0.1' && ip !== 'localhost' && ip !== '::1' && ip !== '39.51.46.64') {
      quarantinedIpsSet.add(ip);
    }
  },

  /**
   * Unban / release an IP address from quarantine
   */
  unbanIp(ip: string) {
    if (ip) {
      quarantinedIpsSet.delete(ip);
      rateTracker.delete(ip);
    }
  },

  /**
   * Get total count of active quarantined IPs
   */
  getQuarantinedCount(): number {
    return quarantinedIpsSet.size;
  },

  /**
   * Extract Client IP
   */
  extractIp(req: any): string {
    const forwarded = req.headers?.['x-forwarded-for'] || req.get?.('x-forwarded-for');
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.headers?.['cf-connecting-ip'] ||
           req.headers?.['x-real-ip'] ||
           req.get?.('cf-connecting-ip') ||
           req.get?.('x-real-ip') ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           '127.0.0.1';
  },

  /**
   * Analyze request headers, User-Agent, Honeypot targets, and injection patterns
   */
  analyze(req: any, explicitPath?: string): BotAnalysisResult {
    const rawUrl = (
      explicitPath ||
      req.originalUrl ||
      req.url ||
      req.path ||
      ''
    ).toString();

    const normalizedPath = rawUrl.toLowerCase();

    // Whitelist all /api/access-control/* and /api/finance/* endpoints from any 403 / bot blocking
    if (
      normalizedPath.includes('/api/access-control') ||
      normalizedPath.includes('/access-control') ||
      normalizedPath.includes('/api/finance') ||
      normalizedPath.includes('/finance')
    ) {
      return {
        isBadBot: false,
        isVerifiedBot: true,
        classification: 'HUMAN',
        botName: 'Whitelisted Core Module',
        threatLevel: 'NONE',
        isHoneypotHit: false
      };
    }

    const ip = this.extractIp(req);
    const WHITELISTED = ['127.0.0.1', '::1', 'localhost', '39.51.46.64'];
    if (ip && WHITELISTED.includes(ip)) {
      return {
        isBadBot: false,
        isVerifiedBot: true,
        classification: 'HUMAN',
        botName: 'Authorized Operator Host',
        threatLevel: 'NONE',
        isHoneypotHit: false
      };
    }

    // 0. Check if this IP is already Quarantined by the Sentinel
    if (this.isQuarantined(ip)) {
      return {
        isBadBot: true,
        isVerifiedBot: false,
        classification: 'BAD_BOT',
        botName: 'Quarantined Host',
        reason: 'IP Address is currently quarantined by Vintage Vibes Security Sentinel',
        threatType: 'QUARANTINED_IP',
        threatLevel: 'CRITICAL',
        isHoneypotHit: false
      };
    }

    const rawUa = (
      req.headers?.['user-agent'] ||
      req.headers?.['User-Agent'] ||
      req.get?.('user-agent') ||
      ''
    ).toString().trim();

    // 1. Honeypot & Attack Path Traps
    for (const trap of HONEYPOT_TRAP_PATHS) {
      if (normalizedPath.includes(trap)) {
        this.quarantineIp(ip);
        return {
          isBadBot: true,
          isVerifiedBot: false,
          classification: 'BAD_BOT',
          botName: 'Malicious Probe Bot',
          reason: `Honeypot Trap: ${trap}`,
          threatType: 'HONEYPOT_PROBE',
          threatLevel: 'CRITICAL',
          isHoneypotHit: true
        };
      }
    }

    // 2. Attack signatures (SQL Injection, Directory Traversal, RCE) in URL or query params
    for (const sig of ATTACK_SIGNATURES) {
      if (sig.regex.test(rawUrl)) {
        this.quarantineIp(ip);
        return {
          isBadBot: true,
          isVerifiedBot: false,
          classification: 'BAD_BOT',
          botName: 'Exploit Injection Bot',
          reason: `${sig.name} detected in request`,
          threatType: sig.threatType,
          threatLevel: 'CRITICAL',
          isHoneypotHit: false
        };
      }
    }

    // 3. Probing non-existent PHP/Wordpress scripts on React SPA
    if (
      normalizedPath.endsWith('.php') ||
      normalizedPath.includes('/wp-') ||
      normalizedPath.includes('/cgi-bin/')
    ) {
      this.quarantineIp(ip);
      return {
        isBadBot: true,
        isVerifiedBot: false,
        classification: 'BAD_BOT',
        botName: 'Malicious Probe Bot',
        reason: `Probing nonexistent PHP/Wordpress vector: ${normalizedPath}`,
        threatType: 'PHP_CMS_PROBE',
        threatLevel: 'CRITICAL',
        isHoneypotHit: true
      };
    }

    // 4. Missing or forged blank User-Agent
    if (!rawUa || rawUa.length < 5 || /^(bot|spider|test|crawler|check|monitor|-)$/i.test(rawUa)) {
      return {
        isBadBot: true,
        isVerifiedBot: false,
        classification: 'BAD_BOT',
        botName: 'Anomaly / Blank User-Agent',
        reason: 'Missing or forged User-Agent header string',
        threatType: 'ANOMALOUS_UA',
        threatLevel: 'CRITICAL'
      };
    }

    // 5. Verified Safe Search Engine / Monitoring Bots
    for (const v of VERIFIED_BOT_PATTERNS) {
      if (v.pattern.test(rawUa)) {
        return {
          isBadBot: false,
          isVerifiedBot: true,
          classification: 'VERIFIED_BOT',
          botName: v.name,
          reason: 'Verified Search Engine Indexer / Uptime Monitor',
          threatType: 'VERIFIED_BOT',
          threatLevel: 'NONE'
        };
      }
    }

    // 6. Known Bad Bots & Automated Scrapers
    for (const b of BAD_BOT_PATTERNS) {
      if (b.pattern.test(rawUa)) {
        return {
          isBadBot: true,
          isVerifiedBot: false,
          classification: 'BAD_BOT',
          botName: b.name,
          reason: b.reason,
          threatType: 'MALICIOUS_SCRAPER',
          threatLevel: 'CRITICAL'
        };
      }
    }

    // 7. Rate Burst Flood (IP rate tracker)
    const now = Date.now();
    if (ip && ip !== '127.0.0.1') {
      const timestamps = rateTracker.get(ip) || [];
      const recent = timestamps.filter(t => now - t < 5000);
      recent.push(now);
      rateTracker.set(ip, recent);

      if (recent.length > 35) {
        this.quarantineIp(ip);
        return {
          isBadBot: true,
          isVerifiedBot: false,
          classification: 'BAD_BOT',
          botName: 'Rapid Query Loop / Flooder',
          reason: `High frequency request burst (${recent.length} reqs / 5s)`,
          threatType: 'BURST_FLOOD',
          threatLevel: 'CRITICAL'
        };
      }
    }

    // 8. Normal Human Session
    return {
      isBadBot: false,
      isVerifiedBot: false,
      classification: 'HUMAN',
      botName: 'Human User / Browser',
      threatLevel: 'NONE'
    };
  }
};

export default BotDetector;
