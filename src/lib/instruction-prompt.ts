import fs from 'node:fs';
import path from 'node:path';

/**
 * instructions 配下の Markdown を読み込み、{{key}} を置換して返す。
 */
export function loadInstructionPrompt(filename: string, variables: Record<string, unknown> = {}): string {
    const filePath = path.join(process.cwd(), 'instructions', filename);
    let content = fs.readFileSync(filePath, 'utf-8');

    for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }

    return content;
}
