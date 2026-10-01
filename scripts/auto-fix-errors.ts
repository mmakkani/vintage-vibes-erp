import { borrowClient } from '../src/db/pgPool.ts';
import fs from 'fs';
import path from 'path';

interface ErrorRecord {
  id: string | number;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  component_stack: string | null;
  url: string | null;
  route_path: string | null;
  source_file: string | null;
  line_number: number | null;
  column_number: number | null;
  user_agent: string | null;
  username: string;
  metadata: any;
  status: string;
  occurrence_count: number;
  last_occurred_at: string;
  created_at: string;
}

export async function fetchPendingErrors(): Promise<ErrorRecord[]> {
  const client = await borrowClient();
  try {
    const res = await client.query(`
      SELECT * FROM system_error_logs
      WHERE status = 'PENDING'
      ORDER BY occurrence_count DESC, last_occurred_at DESC
      LIMIT 50;
    `);
    return res.rows;
  } finally {
    if (typeof client.release === 'function') client.release();
  }
}

export async function markErrorResolved(id: string | number, notes: string): Promise<boolean> {
  const client = await borrowClient();
  try {
    await client.query(`
      UPDATE system_error_logs
      SET status = 'RESOLVED',
          resolved_at = NOW(),
          resolution_notes = $2
      WHERE id = $1;
    `, [id, notes]);
    return true;
  } finally {
    if (typeof client.release === 'function') client.release();
  }
}

export async function clearAllPendingErrors(reason: string = 'Batch resolved / cleared'): Promise<number> {
  const client = await borrowClient();
  try {
    const res = await client.query(`
      UPDATE system_error_logs
      SET status = 'RESOLVED',
          resolved_at = NOW(),
          resolution_notes = $1
      WHERE status = 'PENDING';
    `, [reason]);
    return res.rowCount || 0;
  } finally {
    if (typeof client.release === 'function') client.release();
  }
}

export function extractFileAndLine(stack: string | null): { filePath: string | null; line: number | null } {
  if (!stack) return { filePath: null, line: null };

  // Match typical stack lines like: at MyComponent (c:/vintage-vibe/src/modules/...:123:45)
  // or at src/...:123:45
  const matches = stack.match(/(?:at\s+.*?\s+\(?|\()([a-zA-Z]:[\\\/][^:\)]+|[\\\/][^:\)]+|\.\.?[\\\/][^:\)]+|src[\\\/][^:\)]+):(\d+):(\d+)\)?/);
  if (matches && matches[1] && matches[2]) {
    return {
      filePath: matches[1].replace(/\\/g, '/'),
      line: parseInt(matches[2], 10)
    };
  }

  return { filePath: null, line: null };
}

async function runCli() {
  const args = process.argv.slice(2);

  if (args.includes('--clear-all')) {
    console.log('Clearing all pending error records...');
    const count = await clearAllPendingErrors('Cleared via CLI command');
    console.log(`Successfully marked ${count} error(s) as RESOLVED.`);
    process.exit(0);
  }

  const resolveIndex = args.indexOf('--resolve');
  if (resolveIndex !== -1 && args[resolveIndex + 1]) {
    const targetId = args[resolveIndex + 1];
    const note = args[resolveIndex + 2] || 'Resolved manually';
    await markErrorResolved(targetId, note);
    console.log(`Error #${targetId} marked as RESOLVED.`);
    process.exit(0);
  }

  console.log('\n======================================================');
  console.log('   VINTAGE VIBE ENTERPRISE: AUTONOMOUS ERROR INSPECTOR');
  console.log('======================================================\n');

  const errors = await fetchPendingErrors();

  if (errors.length === 0) {
    console.log('✅ ZERO UNRESOLVED ERRORS! All systems running smooth and error-free.\n');
    process.exit(0);
  }

  console.log(`🚨 Found ${errors.length} pending error group(s) reported from live sessions:\n`);

  for (let i = 0; i < errors.length; i++) {
    const err = errors[i];
    console.log(`------------------------------------------------------`);
    console.log(`[Error #${err.id}] [${err.error_type}] (Occurred: ${err.occurrence_count} time(s))`);
    console.log(`Last Seen: ${new Date(err.last_occurred_at).toLocaleString()}`);
    console.log(`Route:     ${err.route_path || err.url || 'N/A'}`);
    console.log(`User:      ${err.username} (Session: ${err.session_id || 'N/A'})`);
    console.log(`Message:   ${err.error_message}`);

    const { filePath, line } = extractFileAndLine(err.error_stack);
    const targetFile = err.source_file || filePath;
    const targetLine = err.line_number || line;

    if (targetFile) {
      console.log(`File:      ${targetFile}${targetLine ? `:${targetLine}` : ''}`);

      let resolvedPath = targetFile;
      if (!fs.existsSync(resolvedPath)) {
        // Try relative to workspace
        const candidate = path.join(process.cwd(), targetFile.replace(/^[a-zA-Z]:[\\\/]/, ''));
        if (fs.existsSync(candidate)) resolvedPath = candidate;
      }

      if (fs.existsSync(resolvedPath) && targetLine) {
        try {
          const content = fs.readFileSync(resolvedPath, 'utf8');
          const lines = content.split('\n');
          const start = Math.max(0, targetLine - 4);
          const end = Math.min(lines.length, targetLine + 3);
          console.log('\n  Code Context:');
          for (let l = start; l < end; l++) {
            const lineNum = l + 1;
            const prefix = lineNum === targetLine ? '>>' : '  ';
            console.log(`  ${prefix} ${String(lineNum).padStart(4, ' ')} | ${lines[l]}`);
          }
          console.log('');
        } catch (_) {}
      }
    }

    if (err.component_stack) {
      console.log('React Component Hierarchy:');
      const lines = err.component_stack.split('\n').filter(Boolean).slice(0, 4);
      lines.forEach(l => console.log(`   ${l.trim()}`));
    }
  }

  console.log('------------------------------------------------------');
  console.log('💡 To resolve an error after fixing the code:');
  console.log('   npx tsx scripts/auto-fix-errors.ts --resolve <id> "<fix description>"\n');
  process.exit(0);
}

// Execute if run directly
if (process.argv[1]?.includes('auto-fix-errors')) {
  runCli().catch(err => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}
