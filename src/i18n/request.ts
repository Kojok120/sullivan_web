import { getRequestConfig } from 'next-intl/server';

export const DEFAULT_LOCALE = 'ja';

export default getRequestConfig(async () => {
    const locale = DEFAULT_LOCALE;

    return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default,
    };
});
