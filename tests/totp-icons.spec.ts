import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('keepassxc-browser');
const main = fs.readFileSync(path.join(source, 'content/keepassxc-browser.js'), 'utf8');
// Keep the real state and initCombinations, without starting the extension or contacting KeePassXC.
const state = main.slice(0, main.indexOf('// Add page to Site Preferences'));
const initCombinations = main.slice(main.indexOf('kpxc.initCombinations ='),
    main.indexOf('// The main function for finding input fields'));
const formHelpers = main.slice(main.indexOf('kpxc.getDocumentLocation ='),
    main.indexOf('// Returns form action URL'));

async function setup(page, type, markup = null) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<style>input { width: 36px; height: 36px; margin: 4px; }</style>
        ${markup ?? `<form>${Array.from({ length: 6 }, (_, i) =>
        `<input id="digit-${i}" type="${type}" inputmode="numeric" pattern="[0-9]*" maxlength="1">`).join('')}</form>`}`);
    await page.addScriptTag({ content: `
        const browser = { i18n: { getMessage: value => value }, runtime: {
            sendMessage: async () => undefined,
            getURL: () => 'data:text/css,'
        } };
        const kpxcCustomLoginFieldsBanner = { created: false };
    ` });
    for (const file of [ 'common/global.js', 'content/ui.js', 'common/sites.js' ]) {
        await page.addScriptTag({ path: path.join(source, file) });
    }
    await page.addScriptTag({ content: state + formHelpers + initCombinations });
    for (const file of [ 'content/form.js', 'content/fields.js', 'content/icon-handler.js',
        'content/icon.js', 'content/totp-field.js', 'content/observer-helper.js' ]) {
        await page.addScriptTag({ path: path.join(source, file) });
    }
    await page.addScriptTag({ content: `
        kpxc.settings = { showOTPIcon: true, autoFillSingleTotp: false };
        // These icon types are unused by this fixture, but cleanup visits their registries.
        const kpxcUsernameIcons = { icons: [] };
        const kpxcPasswordIcons = { icons: [] };
        window.totpStats = () => ({
            icons: kpxcTOTPIcons.icons.length,
            descriptors: kpxcIcons.icons.length,
            wrappers: document.querySelectorAll('body > div').length,
            combinations: kpxc.combinations.length,
            empty: Array.from(document.querySelectorAll('input')).every(input => input.value === ''),
            segmented: kpxc.combinations.every(c => c.totpInputs?.length === 6 && !c.username && !c.password),
        });
        window.stopTotp = () => {
            kpxc.observer?.disconnect();
            kpxcUI.wrapperObserver?.disconnect();
            kpxcUI.pageObserver?.disconnect();
            kpxcTOTPIcons.icons.forEach(icon => icon.observer?.disconnect());
        };
    ` });
    return errors;
}

for (const type of [ 'text', 'tel' ]) {
    test(`repeated segmented detection keeps one icon and preserves combinations (${type})`, async ({ page }) => {
        const errors = await setup(page, type);
        try {
            const result = await page.evaluate(async () => {
                const inputs = Array.from(document.querySelectorAll('input'));
                const lengths = [];
                for (let i = 0; i < 10; ++i) {
                    const combinations = await kpxcFields.getAllCombinations(inputs);
                    lengths.push(combinations.length);
                    if (combinations[0]?.totpInputs?.some((input, index) => input !== inputs[index])) {
                        throw new Error('Segmented combination lost its input references');
                    }
                }
                return { ...window.totpStats(), lengths };
            });
            console.log(type, 'repeated detection:', result);
            expect(errors).toEqual([]);
            expect(result.lengths).toEqual(Array(10).fill(1));
            expect(result.empty).toBe(true);
            expect(result.icons).toBe(1);
            expect(result.descriptors).toBe(1);
            expect(result.wrappers).toBe(1);
        } finally {
            await page.evaluate(() => window.stopTotp());
        }
    });

    test(`segmented icon DOM mutations settle under the real observer (${type})`, async ({ page }) => {
        const errors = await setup(page, type);
        try {
            const result = await page.evaluate(async () => {
                let detections = 0;
                let bounded = false;
                const original = kpxcFields.getAllCombinations;
                // Disconnect synchronously inside detection: timers cannot break a microtask feedback loop.
                kpxcFields.getAllCombinations = async function(inputs) {
                    if (++detections >= 20) {
                        bounded = true;
                        kpxc.observer.disconnect();
                    }
                    return original(inputs);
                };
                await kpxcObserverHelper.initObserver();
                // Only this initial mutation is supplied by the fixture. Subsequent additions are real icons.
                document.querySelector('form').append(document.createElement('span'));
                await new Promise(resolve => setTimeout(resolve, 150));
                const settledDetections = detections;
                await new Promise(resolve => setTimeout(resolve, 150));
                kpxc.observer.disconnect();
                return { ...window.totpStats(), detections, settledDetections, bounded };
            });
            console.log(type, 'observer feedback:', result);
            expect(errors).toEqual([]);
            expect(result.bounded).toBe(false);
            expect(result.detections).toBeGreaterThanOrEqual(2);
            expect(result.detections).toBeLessThan(20);
            expect(result.detections).toBe(result.settledDetections);
            expect(result.icons).toBe(1);
            expect(result.descriptors).toBe(1);
            expect(result.wrappers).toBe(1);
            expect(result.combinations).toBe(1);
            expect(result.segmented).toBe(true);
            expect(result.empty).toBe(true);
        } finally {
            await page.evaluate(() => window.stopTotp());
        }
    });
}

const ordinaryFixtures = [
    {
        name: 'one input behind six visual OTP slots',
        markup: '<input type="text" autocomplete="one-time-code" data-input-otp maxlength="6" style="width:220px">'
            + '<span aria-hidden="true">□ □ □ □ □ □</span>',
        count: 1,
    },
    {
        name: 'OTP identified by id without autocomplete',
        markup: '<input id="verification-code" type="tel" maxlength="6" style="width:220px">',
        count: 1,
    },
    {
        name: 'four ordinary OTP inputs',
        markup: Array.from({ length: 4 }, (_, i) =>
            `<input id="otp-${i}" type="text" autocomplete="one-time-code" maxlength="6" style="width:220px">`).join(''),
        count: 4,
    },
];

for (const fixture of ordinaryFixtures) {
    test(`ordinary OTP rescans preserve combinations without duplicate icons (${fixture.name})`, async ({ page }) => {
        const errors = await setup(page, 'text', `<form>${fixture.markup}</form>`);
        try {
            const result = await page.evaluate(async () => {
                const inputs = Array.from(document.querySelectorAll('input'));
                const preserved = [];
                for (let i = 0; i < 10; ++i) {
                    await kpxc.initCombinations(inputs);
                    await kpxcIcons.initIcons(kpxc.combinations);
                    const combinations = await kpxcFields.getAllCombinations(inputs);
                    preserved.push(combinations.length === inputs.length
                        && combinations.every((c, index) => c.totp === inputs[index] && !c.username && !c.password));
                }
                // Async callers may overlap; icon creation must still be idempotent.
                await Promise.all(Array.from({ length: 10 }, () => kpxcIcons.initIcons(kpxc.combinations)));
                return { ...window.totpStats(), preserved };
            });
            expect(errors).toEqual([]);
            expect(result.preserved).toEqual(Array(10).fill(true));
            expect(result.icons).toBe(fixture.count);
            expect(result.descriptors).toBe(fixture.count);
            expect(result.wrappers).toBe(fixture.count);
            expect(result.combinations).toBe(fixture.count);
            expect(result.empty).toBe(true);
        } finally {
            await page.evaluate(() => window.stopTotp());
        }
    });

    test(`mounting ordinary OTP fields settles under the real observer (${fixture.name})`, async ({ page }) => {
        const errors = await setup(page, 'text', `<form></form><template>${fixture.markup}</template>`);
        try {
            const result = await page.evaluate(async () => {
                let detections = 0;
                let bounded = false;
                const original = kpxcFields.getAllCombinations;
                kpxcFields.getAllCombinations = async function(inputs) {
                    if (++detections >= 20) {
                        bounded = true;
                        kpxc.observer.disconnect();
                    }
                    return original(inputs);
                };
                await kpxcObserverHelper.initObserver();
                document.querySelector('form').append(document.querySelector('template').content.cloneNode(true));
                await new Promise(resolve => setTimeout(resolve, 150));
                const settledDetections = detections;
                await new Promise(resolve => setTimeout(resolve, 150));
                kpxc.observer.disconnect();
                kpxcFields.getAllCombinations = original;
                const inputs = Array.from(document.querySelectorAll('input'));
                const combinations = await kpxcFields.getAllCombinations(inputs);
                return { ...window.totpStats(), detections, settledDetections, bounded,
                    preserved: combinations.length === inputs.length
                        && combinations.every((c, index) => c.totp === inputs[index]),
                };
            });
            expect(errors).toEqual([]);
            expect(result.bounded).toBe(false);
            expect(result.detections).toBeGreaterThanOrEqual(2);
            expect(result.detections).toBeLessThan(20);
            expect(result.detections).toBe(result.settledDetections);
            expect(result.icons).toBe(fixture.count);
            expect(result.descriptors).toBe(fixture.count);
            expect(result.wrappers).toBe(fixture.count);
            expect(result.combinations).toBe(fixture.count);
            expect(result.preserved).toBe(true);
            expect(result.empty).toBe(true);
        } finally {
            await page.evaluate(() => window.stopTotp());
        }
    });
}

test('ordinary OTP recognition remains available with OTP icons disabled', async ({ page }) => {
    const errors = await setup(page, 'text', `<form>${ordinaryFixtures[0].markup}</form>`);
    try {
        const result = await page.evaluate(async () => {
            kpxc.settings.showOTPIcon = false;
            const inputs = Array.from(document.querySelectorAll('input'));
            for (let i = 0; i < 10; ++i) {
                await kpxc.initCombinations(inputs);
                await kpxcIcons.initIcons(kpxc.combinations);
            }
            return { ...window.totpStats(), recognized: kpxc.combinations[0]?.totp === inputs[0] };
        });
        expect(errors).toEqual([]);
        expect(result.recognized).toBe(true);
        expect(result.combinations).toBe(1);
        expect(result.icons).toBe(0);
        expect(result.descriptors).toBe(0);
        expect(result.wrappers).toBe(0);
        expect(result.empty).toBe(true);
    } finally {
        await page.evaluate(() => window.stopTotp());
    }
});

test('a hidden ordinary OTP icon can be cleaned up and recreated when its field returns', async ({ page }) => {
    const errors = await setup(page, 'text', `<form>${ordinaryFixtures[0].markup}</form>`);
    try {
        const result = await page.evaluate(async () => {
            const input = document.querySelector('input');
            await kpxc.initCombinations([ input ]);
            await kpxcIcons.initIcons(kpxc.combinations);
            const before = window.totpStats();
            input.style.display = 'none';
            kpxcIcons.deleteAllHiddenIcons();
            const hidden = window.totpStats();
            input.style.display = '';
            await kpxc.initCombinations([ input ]);
            await kpxcIcons.initIcons(kpxc.combinations);
            await kpxcIcons.initIcons(kpxc.combinations);
            return { before, hidden, after: window.totpStats(),
                recognized: kpxc.combinations[0]?.totp === input,
            };
        });
        expect(errors).toEqual([]);
        for (const stats of [ result.before, result.after ]) {
            expect(stats.icons).toBe(1);
            expect(stats.descriptors).toBe(1);
            expect(stats.wrappers).toBe(1);
            expect(stats.empty).toBe(true);
        }
        expect(result.hidden.icons).toBe(0);
        expect(result.hidden.descriptors).toBe(0);
        expect(result.hidden.wrappers).toBe(0);
        expect(result.recognized).toBe(true);
    } finally {
        await page.evaluate(() => window.stopTotp());
    }
});
