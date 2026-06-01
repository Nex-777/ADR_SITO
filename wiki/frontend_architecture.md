# Frontend Architecture: Landing Page

The main entry point of the project is [index.html](../index.html). It serves as the public landing page for Adrenalina Club, introducing its identity, disciplines, and registration access point.

---

## 🎨 Visual Identity & Styling

The landing page features a **Kinetic Brutalism** design aesthetic:
-   **Color Palette**: High-contrast dark interface (`#0e0e0e`) offset by a vibrant Red accent (`#df293e`).
-   **Typography**: Clean Orbitron and Syncopate headers combined with Manrope body font.
-   **Visual Effects**:
    -   *Slanted Headlines*: Custom headings skewed at `-10deg` (`transform: skewX(-10deg)`) for a dynamic visual slant.
    -   *Background Parallax*: GSAP animations applied to background images.
    -   *Grain Overlay*: A subtle SVG noise overlay for texture.
    -   *Hover Skews*: Card modules warp slightly on mouse-over via `.kinetic-skew:hover`.
    -   *Glitch Effects*: Critical buttons animate with a digital glitch state during hover.

---

## 🏎️ Animation & Interaction Libraries

1.  **Lenis Smooth Scroll**: Instantiated globally to ensure smooth scrolling behavior across desktop devices. Custom config:
    ```javascript
    const lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1,
    });
    ```
2.  **GSAP (GreenSock) & ScrollTrigger**:
    -   *Hero Parallax*: Scrolls the hero background element (`#hero-bg`) at a offset speed ratio relative to the page offset.
    -   *Fades & Reveals*: Target headers (`.reveal-header`) use ScrollTrigger to skew-up and slide-in from vertical offsets when scrolled into viewport viewports.

---

## 📱 Responsiveness

-   Navigation header automatically collapses into a fullscreen mobile menu overlay on smaller viewports.
-   Dynamic typography utilizes responsive scales, notably:
    ```css
    .header-scale-lg { font-size: clamp(2.5rem, 8vw, 9rem); }
    .header-scale-xl { font-size: clamp(3.5rem, 10vw, 11rem); }
    ```

---

## 📊 Table Sorting Standard

Every tabular data visualization must support column-based sorting:
-   **Click behavior**: Clicking a column header sorts rows in ascending order on the first click, and descending on the second click.
-   **Visual feedback**: Active sorting headers display indicator icons (`▲` for ascending, `▼` for descending).
-   **Styling**:
    -   Sort indicator spans use `text-primary font-bold ml-1`.
    -   Clickable headers use classes `cursor-pointer hover:bg-white/10 select-none transition-all`.
-   **Implementation**: Done client-side via utility functions `sortArray` and `updateSortIcon` operating on global components state arrays (e.g., `sociData`, `tesseratiData`, `quoteData`, `direttivoData`, `bilanciData`, `contabilitaData`).
