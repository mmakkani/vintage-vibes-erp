/**
 * Vintage Vibes Automated Bot Detection & Security Guard Engine
 * Analyzes incoming request headers, user-agents, IP frequency, and path targets
 * to automatically identify and block malicious crawlers, scrapers, and exploit probes.
 */

export type BotClassification = 'HUMAN' | 'VERIFIED_BOT' | 'BAD_BOT';

export interface BotAnalysisResult {
  isBadBot: boolean;
  isVerifiedBot: boolean;
  classification: BotClassification;
  botName: string;
  reason?: string;
  threatLevel: 'NONE' | 'LOW' | 'CRITICAL';
}

// Known legitimate search engine indexers and monitoring services
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
  { pattern: /curl\//i, name: 'cURL Command Utility', reason: 'Automated terminal cURL request' },
  { pattern: /wget\//i, name: 'Wget Downloader', reason: 'Automated terminal Wget scraper' },
  { pattern: /httpie/i, name: 'HTTPie CLI', reason: 'Automated command-line client' },
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

// Sensitive exploit probe paths that legitimate clients never request
const SENSITIVE_PROBE_PATHS = [
  '/.env',
  '/.git',
  '/.aws',
  '/.vscode',
  '/.ds_store',
  '/wp-admin',
  '/wp-login.php',
  '/wp-content',
  '/xmlrpc.php',
  '/phpmyadmin',
  '/pma',
  '/config.json',
  '/server-status',
  '/actuator',
  '/solr',
  '/eval-stdin.php',
  '/backup.sql',
  '/dump.sql',
  '/database.sql',
  '/etc/passwd',
  '/web.config',
  '/.svn',
  '/phpinfo.php'
];

// In-memory rate tracker for rapid query loops (IP -> timestamps[])
const rateTracker = new Map<string, number[]>();

export const BotDetector = {
  /**
   * Analyze request headers, User-Agent, and destination path
   */
  analyze(req: any, explicitPath?: string): BotAnalysisResult {
    const rawUa = (
      req.headers?.['user-agent'] ||
      req.headers?.['User-Agent'] ||
      req.get?.('user-agent') ||
      ''
    ).toString().trim();

    const normalizedPath = (
      explicitPath ||
      req.originalUrl ||
      req.url ||
      req.path ||
      ''
    ).toString().toLowerCase();

    // 1. Check for Sensitive Path Probing / Exploits
    for (const probe of SENSITIVE_PROBE_PATHS) {
      if (normalizedPath.includes(probe)) {
        return {
          isBadBot: true,
          isVerifiedBot: false,
          classification: 'BAD_BOT',
          botName: 'Exploit Scanner / Probe',
          reason: `Targeting sensitive exploit path (${probe})`,
          threatLevel: 'CRITICAL'
        };
      }
    }

    // 2. Check for WordPress / PHP Exploits on SPA React App
    if (
      normalizedPath.endsWith('.php') ||
      normalizedPath.includes('/wp-') ||
      normalizedPath.includes('/cgi-bin/')
    ) {
      return {
        isBadBot: true,
        isVerifiedBot: false,
        classification: 'BAD_BOT',
        botName: 'CMS Exploit Scanner',
        reason: `Probing nonexistent PHP / WordPress vectors on React SPA`,
        threatLevel: 'CRITICAL'
      };
    }

    // 3. Check for Empty or Suspicious Short User-Agent
    if (!rawUa || rawUa.length < 6 || /^(bot|spider|test|crawler|check|monitor|-)$/i.test(rawUa)) {
      return {
        isBadBot: true,
        isVerifiedBot: false,
        classification: 'BAD_BOT',
        botName: 'Anomaly / Blank User-Agent',
        reason: 'Missing or forged User-Agent header string',
        threatLevel: 'CRITICAL'
      };
    }

    // 4. Check for Verified Safe Search Engine / Monitoring Bots
    for (const v of VERIFIED_BOT_PATTERNS) {
      if (v.pattern.test(rawUa)) {
        return {
          isBadBot: false,
          isVerifiedBot: true,
          classification: 'VERIFIED_BOT',
          botName: v.name,
          reason: 'Verified Search Engine Indexer / Uptime Monitor',
          threatLevel: 'NONE'
        };
      }
    }

    // 5. Check for Known Bad Bots & Scrapers
    for (const b of BAD_BOT_PATTERNS) {
      if (b.pattern.test(rawUa)) {
        return {
          isBadBot: true,
          isVerifiedBot: false,
          classification: 'BAD_BOT',
          botName: b.name,
          reason: b.reason,
          threatLevel: 'CRITICAL'
        };
      }
    }

    // 6. Check for Rapid Query Loops / Flooding (IP burst rate analysis)
    const forwarded = req.headers?.['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
               req.headers?.['cf-connecting-ip'] ||
               req.headers?.['x-real-ip'] ||
               req.socket?.remoteAddress ||
               '127.0.0.1';

    const now = Date.now();
    const windowMs = 5000; // 5 seconds
    const maxRequests = 40; // max allowed burst in 5 seconds without session

    if (ip && ip !== '127.0.0.1') {
      const timestamps = rateTracker.get(ip) || [];
      const recent = timestamps.filter(t => now - t < windowMs);
      recent.push(now);
      rateTracker.set(ip, recent);

      if (recent.length > maxRequests) {
        return {
          isBadBot: true,
          isVerifiedBot: false,
          classification: 'BAD_BOT',
          botName: 'Rapid Query Loop / Flooder',
          reason: `High frequency request burst (${recent.length} reqs / 5s)`,
          threatLevel: 'CRITICAL'
        };
      }
    }

    // 7. Legitimate Human / Browser Session
    return {
      isBadBot: false,
      isVerifiedBot: false,
      classification: 'HUMAN',
      botName: 'Human User / Browser',
      threatLevel: 'NONE'
    };
  }
};
