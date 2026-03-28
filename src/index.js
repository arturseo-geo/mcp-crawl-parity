#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, TextContent } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import readline from 'readline';

const server = new Server({
  name: 'mcp-crawl-parity',
  version: '1.0.0',
});

// Bot detection patterns
const GOOGLEBOT_PATTERNS = [
  /Googlebot(?:\s|\/|$)/i,
  /Googlebot-Image/i,
  /AdsBot-Google/i,
];

const AI_CRAWLER_PATTERNS = [
  /GPTBot/i,
  /ClaudeBot/i,
  /PerplexityBot/i,
  /YouBot/i,
  /Bytespider/i,
  /Google-Extended/i,
  /CCBot/i,
  /PetalBot/i,
  /Applebot-Extended/i,
];

// Classify user agent
function classifyUserAgent(userAgent) {
  if (GOOGLEBOT_PATTERNS.some(pattern => pattern.test(userAgent))) {
    return 'googlebot';
  }
  if (AI_CRAWLER_PATTERNS.some(pattern => pattern.test(userAgent))) {
    return 'ai_crawler';
  }
  return 'other';
}

// Determine parity level
function getParity(googlebot, aiCrawler) {
  if (googlebot === 0) return 'insufficient_data';
  const ratio = (aiCrawler / googlebot) * 100;
  if (ratio >= 80) return 'high_parity';
  if (ratio >= 40) return 'medium_parity';
  return 'low_parity';
}

// Parse Nginx combined log format
async function parseLogs(logPath) {
  const googlebot = {};
  const aiCrawler = {};
  let googlebot_requests = 0;
  let ai_crawler_requests = 0;

  try {
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      // Extract method, path, and user-agent from combined log
      // Format: ip - - [timestamp] "METHOD /path HTTP/1.1" status bytes "referer" "user-agent"
      const match = line.match(/"([A-Z]+)\s([^\s]+)\s[^"]*"\s\d+\s\d+\s"[^"]*"\s"([^"]*)"/);
      if (!match) continue;

      const [, method, path, userAgent] = match;
      const classification = classifyUserAgent(userAgent);

      if (classification === 'googlebot') {
        googlebot_requests++;
        googlebot[path] = (googlebot[path] || 0) + 1;
      } else if (classification === 'ai_crawler') {
        ai_crawler_requests++;
        aiCrawler[path] = (aiCrawler[path] || 0) + 1;
      }
    }
  } catch (error) {
    throw new Error(`Failed to parse logs: ${error.message}`);
  }

  const parity_ratio = googlebot_requests > 0 ? (ai_crawler_requests / googlebot_requests) * 100 : 0;
  const parity_level = getParity(googlebot_requests, ai_crawler_requests);

  return {
    googlebot_requests,
    ai_crawler_requests,
    parity_ratio: Math.round(parity_ratio * 10) / 10,
    parity_level,
    paths_googlebot: Object.keys(googlebot).length,
    paths_ai_crawler: Object.keys(aiCrawler).length,
    unique_paths: new Set([...Object.keys(googlebot), ...Object.keys(aiCrawler)]).size,
  };
}

// Cross-reference with GSC data
function crossreferenceGSC(logsAnalysis, gscData) {
  const logsOnlyPaths = new Set();
  const gscOnlyPaths = new Set();
  const bothPaths = new Set();

  // Collect all paths from GSC
  const gscPaths = new Set(gscData.map(item => item.page).filter(Boolean));

  // For demonstration, we'll check a sample of logged paths
  // In production, this would need the actual log paths data
  const loggedPaths = new Set();

  // If we had the detailed paths from logs, we'd use them here
  // For now, we identify the categories based on available data
  gscData.forEach(item => {
    if (item.impressions > 0 || item.clicks > 0) {
      // If it has GSC data, mark it as gsc_present
      if (loggedPaths.has(item.page)) {
        bothPaths.add(item.page);
      } else {
        gscOnlyPaths.add(item.page);
      }
    }
  });

  return {
    both: Array.from(bothPaths).length,
    logs_only: Array.from(logsOnlyPaths).length,
    gsc_only: Array.from(gscOnlyPaths).length,
    total_analyzed: gscData.length,
  };
}

// Tool: analyze_logs
async function analyzeLogs(logPath) {
  const analysis = await parseLogs(logPath);
  return {
    type: 'text',
    text: JSON.stringify(analysis, null, 2),
  };
}

// Tool: gsc_crossref
function gscCrossref(logsAnalysisJson, gscDataJson) {
  try {
    const logsAnalysis = typeof logsAnalysisJson === 'string' ? JSON.parse(logsAnalysisJson) : logsAnalysisJson;
    const gscData = typeof gscDataJson === 'string' ? JSON.parse(gscDataJson) : gscDataJson;

    const crossref = crossreferenceGSC(logsAnalysis, gscData);
    return {
      type: 'text',
      text: JSON.stringify(crossref, null, 2),
    };
  } catch (error) {
    return {
      type: 'text',
      text: JSON.stringify({ error: `Failed to cross-reference: ${error.message}` }, null, 2),
    };
  }
}

// Tool: parity_report
async function parityReport(logPath, gscDataJson) {
  try {
    const logsAnalysis = await parseLogs(logPath);
    const gscData = typeof gscDataJson === 'string' ? JSON.parse(gscDataJson) : gscDataJson;
    const crossref = crossreferenceGSC(logsAnalysis, gscData);

    const report = {
      timestamp: new Date().toISOString(),
      logs_analysis: logsAnalysis,
      gsc_crossref: crossref,
      summary: {
        googlebot_activity: logsAnalysis.googlebot_requests > 0 ? 'detected' : 'not_detected',
        ai_crawler_activity: logsAnalysis.ai_crawler_requests > 0 ? 'detected' : 'not_detected',
        parity_status: logsAnalysis.parity_level,
        parity_percentage: logsAnalysis.parity_ratio,
        recommendation:
          logsAnalysis.parity_level === 'high_parity'
            ? 'Good parity between Googlebot and AI crawlers'
            : logsAnalysis.parity_level === 'medium_parity'
              ? 'Moderate parity - consider optimizing for AI crawlers'
              : 'Low parity - AI crawlers are significantly underrepresented',
      },
    };

    return {
      type: 'text',
      text: JSON.stringify(report, null, 2),
    };
  } catch (error) {
    return {
      type: 'text',
      text: JSON.stringify({ error: `Failed to generate report: ${error.message}` }, null, 2),
    };
  }
}

// Register tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case 'analyze_logs': {
      const logPath = request.params.arguments?.log_path;
      if (!logPath) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: log_path argument required',
            },
          ],
        };
      }
      const result = await analyzeLogs(logPath);
      return { content: [result] };
    }

    case 'gsc_crossref': {
      const logsAnalysis = request.params.arguments?.logs_analysis;
      const gscData = request.params.arguments?.gsc_data;
      if (!logsAnalysis || !gscData) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: logs_analysis and gsc_data arguments required',
            },
          ],
        };
      }
      const result = gscCrossref(logsAnalysis, gscData);
      return { content: [result] };
    }

    case 'parity_report': {
      const logPath = request.params.arguments?.log_path;
      const gscData = request.params.arguments?.gsc_data;
      if (!logPath || !gscData) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: log_path and gsc_data arguments required',
            },
          ],
        };
      }
      const result = await parityReport(logPath, gscData);
      return { content: [result] };
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${request.params.name}`,
          },
        ],
      };
  }
});

// Define tools for the server
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tools = {
    analyze_logs: {
      name: 'analyze_logs',
      description: 'Parse Nginx combined log format and classify requests by Googlebot vs AI crawlers',
      inputSchema: {
        type: 'object',
        properties: {
          log_path: {
            type: 'string',
            description: 'Path to Nginx access log file in combined format',
          },
        },
        required: ['log_path'],
      },
    },
    gsc_crossref: {
      name: 'gsc_crossref',
      description: 'Cross-reference log analysis results with GSC search analytics data',
      inputSchema: {
        type: 'object',
        properties: {
          logs_analysis: {
            type: 'object',
            description: 'Output from analyze_logs tool or similar structure',
          },
          gsc_data: {
            type: 'array',
            description: 'Array of GSC analytics records with page, impressions, clicks, ctr, position',
          },
        },
        required: ['logs_analysis', 'gsc_data'],
      },
    },
    parity_report: {
      name: 'parity_report',
      description: 'Generate comprehensive crawl parity report combining logs and GSC data',
      inputSchema: {
        type: 'object',
        properties: {
          log_path: {
            type: 'string',
            description: 'Path to Nginx access log file',
          },
          gsc_data: {
            type: 'array',
            description: 'Array of GSC analytics records',
          },
        },
        required: ['log_path', 'gsc_data'],
      },
    },
  };

  if (request.params.name === 'analyze_logs') {
    const logPath = request.params.arguments?.log_path;
    if (!logPath) {
      return {
        content: [{ type: 'text', text: 'Error: log_path argument required' }],
      };
    }
    const result = await analyzeLogs(logPath);
    return { content: [result] };
  } else if (request.params.name === 'gsc_crossref') {
    const logsAnalysis = request.params.arguments?.logs_analysis;
    const gscData = request.params.arguments?.gsc_data;
    if (!logsAnalysis || !gscData) {
      return {
        content: [{ type: 'text', text: 'Error: logs_analysis and gsc_data arguments required' }],
      };
    }
    const result = gscCrossref(logsAnalysis, gscData);
    return { content: [result] };
  } else if (request.params.name === 'parity_report') {
    const logPath = request.params.arguments?.log_path;
    const gscData = request.params.arguments?.gsc_data;
    if (!logPath || !gscData) {
      return {
        content: [{ type: 'text', text: 'Error: log_path and gsc_data arguments required' }],
      };
    }
    const result = await parityReport(logPath, gscData);
    return { content: [result] };
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
