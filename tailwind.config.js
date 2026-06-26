/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: [
        "./*.html",
        "./portal/*.html",
        "./api/**/*.js",
        "./portal/**/*.js",
        "./*.js"
    ],
    theme: {
        extend: {
            colors: {
                "primary": "#df293e",
                "primary-dim": "#b91c1c",
                "background": "#0e0e0e",
                "surface": "#0e0e0e",
                "surface-container": "#1a1a1a",
                "surface-container-high": "#20201f",
                "surface-container-low": "#131313",
                "on-surface": "#ffffff",
                "on-surface-variant": "#adaaaa",
            },
            borderRadius: {
                "DEFAULT": "0px",
                "sm": "2px",
                "portal": "1.5rem"
            },
            fontFamily: {
                "headline": ["Orbitron", "sans-serif"],
                "body": ["Manrope", "sans-serif"],
                "label": ["Syncopate", "Inter", "sans-serif"]
            }
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/container-queries')
    ],
}
