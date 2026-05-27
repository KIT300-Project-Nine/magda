const DARK_QUERY = "(prefers-color-scheme: dark)";

const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const lightThemeColor = themeColorMeta?.getAttribute("content") || "#320e3b";

function applyTheme(isDark) {
    const body = document.body;
    if (isDark) {
        body.classList.add("rs-theme-dark");
        body.classList.remove("rs-theme-light");
    } else {
        body.classList.remove("rs-theme-dark");
        body.classList.add("rs-theme-light");
    }
    themeColorMeta?.setAttribute(
        "content",
        isDark ? "#1a1d24" : lightThemeColor
    );
}

export function initDarkMode() {
    const mql = window.matchMedia(DARK_QUERY);
    applyTheme(mql.matches);
    mql.addEventListener("change", (e) => applyTheme(e.matches));
}
