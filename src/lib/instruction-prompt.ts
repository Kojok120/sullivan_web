import fs from 'node:fs';
import path from 'node:path';

/**
 * instructions 配下の Markdown を読み込み、{{key}} を置換して返す。
 */
export function loadInstructionPrompt(filename: string, variables: Record<string, unknown> = {}): string {
    const instructionsDir = path.resolve(process.cwd(), 'instructions');
    const resolvedPath = path.resolve(instructionsDir, filename);
    if (resolvedPath !== instructionsDir && !resolvedPath.startsWith(`${instructionsDir}${path.sep}`)) {
        throw new Error('無効なプロンプトファイルパスです');
    }

    let content = fs.readFileSync(resolvedPath, 'utf-8');

    for (const [key, value] of Object.entries(variables)) {
        const token = `{{${key}}}`;
        content = content.split(token).join(String(value));
    }

    return content;
}
