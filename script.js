const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const nav = document.querySelector('.nav');
if (mobileMenuToggle && nav) {
    mobileMenuToggle.addEventListener('click', () => {
        nav.classList.toggle('mobile-open');
        mobileMenuToggle.classList.toggle('active');
    });
    
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('mobile-open');
            mobileMenuToggle.classList.remove('active');
        });
    });
}

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
    });
}, { threshold: 0.15 });

document.querySelectorAll('.fade-in, .fade-in-item').forEach(el => {
    if (el.classList.contains('hero')) {
        setTimeout(() => el.classList.add('is-visible'), 100);
    }
    observer.observe(el);
});

const heroBg = document.querySelector('.hero-bg');
const aboutBg = document.querySelector('.about-bg');
if (heroBg) heroBg.classList.add('active');

const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            document.querySelectorAll('.section-bg').forEach(bg => bg.classList.remove('active'));
            (entry.target.id === 'about' ? aboutBg : heroBg)?.classList.add('active');
        }
    });
}, { threshold: 0.3 });

[document.querySelector('.hero'), document.querySelector('#about')].forEach(el => el && sectionObserver.observe(el));

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
        const href = anchor.getAttribute('href');
        if (href === '#' || href === '#top') return;
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
            window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 100, behavior: 'smooth' });
        }
    });
});
