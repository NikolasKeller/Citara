// ===========================
// TKHC — Interactive Scripts
// ===========================

document.addEventListener('DOMContentLoaded', () => {
    // --- Navbar scroll effect ---
    const navbar = document.getElementById('navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        if (currentScroll > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        lastScroll = currentScroll;
    });

    // --- Mobile menu toggle ---
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });

        // Close mobile menu on link click
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                mobileMenuBtn.classList.remove('active');
            });
        });
    }

    // --- FAQ Accordion ---
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            // Close all items
            faqItems.forEach(i => i.classList.remove('active'));

            // Toggle current
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // --- Scroll animations ---
    const animateElements = document.querySelectorAll(
        '.problem-card, .feature-card, .step-card, .service-card, .result-card, .testimonial-card, .pricing-card, .faq-item'
    );

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry, index) => {
                if (entry.isIntersecting) {
                    // Stagger animation
                    setTimeout(() => {
                        entry.target.classList.add('animate-visible');
                    }, index * 80);
                    observer.unobserve(entry.target);
                }
            });
        },
        {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px',
        }
    );

    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(el);
    });

    // Add the visible class style
    const style = document.createElement('style');
    style.textContent = `
        .animate-visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);

    // --- Smooth scroll for anchor links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                const navHeight = navbar.offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth',
                });
            }
        });
    });

    // --- Counter animation for results ---
    const resultNumbers = document.querySelectorAll('.result-number');
    const counterObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    counterObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.5 }
    );

    resultNumbers.forEach(el => counterObserver.observe(el));

    function animateCounter(element) {
        const text = element.textContent;
        const match = text.match(/[\d.]+/);
        if (!match) return;

        const target = parseFloat(match[0]);
        const prefix = text.substring(0, text.indexOf(match[0]));
        const suffix = text.substring(text.indexOf(match[0]) + match[0].length);
        const duration = 1500;
        const start = performance.now();
        const isDecimal = match[0].includes('.');

        function update(currentTime) {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            const current = target * eased;

            if (isDecimal) {
                element.textContent = prefix + current.toFixed(0) + suffix;
            } else {
                element.textContent = prefix + Math.floor(current).toLocaleString('en') + suffix;
            }

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = text;
            }
        }

        requestAnimationFrame(update);
    }

    // --- Language Toggle (EN/DE) ---
    const langToggle = document.getElementById('langToggle');

    if (langToggle) {
        let currentLang = localStorage.getItem('citara-lang') || 'en';

        function applyLanguage(lang) {
            const elements = document.querySelectorAll('[data-de]');
            elements.forEach(el => {
                if (lang === 'de') {
                    if (!el.dataset.en) {
                        el.dataset.en = el.textContent;
                    }
                    el.textContent = el.dataset.de;
                } else {
                    if (el.dataset.en) {
                        el.textContent = el.dataset.en;
                    }
                }
            });

            // Update toggle UI
            const options = langToggle.querySelectorAll('.lang-option');
            options.forEach(opt => {
                opt.classList.toggle('lang-active', opt.dataset.lang === lang);
            });
            if (lang === 'de') {
                langToggle.classList.add('de');
            } else {
                langToggle.classList.remove('de');
            }

            document.documentElement.lang = lang === 'de' ? 'de' : 'en';
            localStorage.setItem('citara-lang', lang);
            currentLang = lang;
        }

        langToggle.addEventListener('click', () => {
            const newLang = currentLang === 'en' ? 'de' : 'en';
            applyLanguage(newLang);
        });

        // Apply stored language on page load
        if (currentLang === 'de') {
            applyLanguage('de');
        }
    }
});
