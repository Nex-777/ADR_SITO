        // GSAP Initialization
        gsap.registerPlugin(ScrollTrigger);

        // Lenis Smooth Scroll Optimized
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            wheelMultiplier: 1,
        });

        lenis.on('scroll', ScrollTrigger.update);

        function raf(time) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);

        gsap.ticker.add((time) => {
            lenis.raf(time * 1000);
        });
        gsap.ticker.lagSmoothing(0);

        // Hero Parallax & Scroll Fade
        gsap.to("#hero-bg", {
            y: "20%",
            ease: "none",
            scrollTrigger: {
                trigger: "section",
                start: "top top",
                end: "bottom top",
                scrub: true
            }
        });

        gsap.to("#scroll-prompt", {
            opacity: 0,
            y: -50,
            scrollTrigger: {
                trigger: "#activities",
                start: "top 90%",
                end: "top 60%",
                scrub: true
            }
        });

        // Reveal Animations
        const revealHeaders = document.querySelectorAll('.reveal-header');
        revealHeaders.forEach(el => {
            gsap.to(el, {
                opacity: 1,
                y: 0,
                skewY: 0,
                duration: 1.2,
                ease: "power4.out",
                scrollTrigger: {
                    trigger: el,
                    start: "top 85%",
                    toggleActions: "play none none none"
                }
            });
        });

        const revealTexts = document.querySelectorAll('.reveal-text');
        revealTexts.forEach(el => {
            gsap.to(el, {
                opacity: 1,
                y: 0,
                duration: 1,
                delay: 0.2,
                ease: "power3.out",
                scrollTrigger: {
                    trigger: el,
                    start: "top 90%",
                    toggleActions: "play none none none"
                }
            });
        });

        // Search for all anchor links and add click event
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    lenis.scrollTo(target);
                }
            });
        });

        // Mobile Menu Logic
        const menuOverlay = document.getElementById('mobile-menu-overlay');
        const openBtn = document.getElementById('open-menu');
        const closeBtn = document.getElementById('close-menu');
        const navLinks = document.querySelectorAll('.mobile-nav-link');

        function toggleMenu() {
            menuOverlay.classList.toggle('active');
            if (menuOverlay.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = 'auto';
            }
        }

        openBtn.addEventListener('click', toggleMenu);
        closeBtn.addEventListener('click', toggleMenu);
        navLinks.forEach(link => link.addEventListener('click', toggleMenu));

document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('auto-index-submit-1');
    if (el) {
        el.addEventListener('submit', function(event) {
            event.preventDefault(); alert('Message Sent! (Production mode: integrate backend)');
        });
    }
});
