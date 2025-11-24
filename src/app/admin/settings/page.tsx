import { getSystemSettings } from "./actions";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
    const settings = await getSystemSettings();

    return (
        <div className="container mx-auto py-10 max-w-4xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">システム設定</h1>
                <p className="text-muted-foreground">
                    学習アルゴリズムのパラメータやシステム全体の機能を設定します。
                </p>
            </div>
            <SettingsForm initialSettings={settings} />
        </div>
    );
}
