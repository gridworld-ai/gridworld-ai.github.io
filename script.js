// Spacetime canvas background
const canvas = document.getElementById('spacetime-canvas');
const ctx = canvas.getContext('2d');

function isLightMode() {
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'light') return true;
    if (theme === 'dark') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
}

function getConfig() {
    const light = isLightMode();
    return {
        gridSpacing: 40,
        gridLineWidth: light ? 1 : 0.8,
        gridColor: light ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
        nodeRadius: 3,
        nodeColor: light ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.4)',
        nodeRingColor: light ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.15)',
        cursorMass: 70,
        autonomousMass: 50,
        softeningLength: 35,
        maxDisplacement: 18,
    };
}

let CONFIG = getConfig();

function getStoredTheme() {
    return localStorage.getItem('theme') || null;
}

function setTheme(theme) {
    if (theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('theme');
    }
    CONFIG = getConfig();
}

function initTheme() {
    const stored = getStoredTheme();
    if (stored) setTheme(stored);
    else CONFIG = getConfig();
}
initTheme();

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (!getStoredTheme()) CONFIG = getConfig();
    });
}

// Mouse position with smooth interpolation
let mouse = { x: -1000, y: -1000 };
let smoothMouse = { x: -1000, y: -1000 };

// Logical dimensions (for drawing)
let width = window.innerWidth;
let height = window.innerHeight;

// Canvas resize handler
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

document.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
}, { passive: true });

document.addEventListener('mouseleave', () => {
    mouse.x = -1000;
    mouse.y = -1000;
});

// Grid-following Point Mass that navigates intersections
class GridNavigator {
    constructor(mass, speed, startCol, startRow) {
        this.mass = mass;
        this.speed = speed;
        
        // Current grid cell position
        this.gridCol = startCol;
        this.gridRow = startRow;
        
        // Direction: 0=right, 1=down, 2=left, 3=up
        this.direction = Math.floor(Math.random() * 4);
        
        // Progress along current segment (0 to 1) - start at intersection (0)
        this.progress = 0;
        
        // Actual position - initialize at exact grid intersection
        const spacing = CONFIG.gridSpacing;
        this.x = startCol * spacing;
        this.y = startRow * spacing;
        
        // Turn probability at intersections
        this.turnProbability = 0.3 + Math.random() * 0.4;
    }

    update(dt) {
        const spacing = CONFIG.gridSpacing;
        const cols = Math.floor(width / spacing);
        const rows = Math.floor(height / spacing);
        
        // Move along current direction
        this.progress += dt * this.speed;
        
        // Check if we've reached an intersection
        if (this.progress >= 1) {
            this.progress -= 1;
            
            // Move to next grid cell
            switch (this.direction) {
                case 0: this.gridCol++; break; // right
                case 1: this.gridRow++; break; // down
                case 2: this.gridCol--; break; // left
                case 3: this.gridRow--; break; // up
            }
            
            // Decide whether to turn at intersection
            if (Math.random() < this.turnProbability) {
                // Turn left or right (not reverse)
                const turn = Math.random() < 0.5 ? 1 : -1;
                this.direction = (this.direction + turn + 4) % 4;
            }
            
            // Boundary handling - turn around at edges with some margin
            const margin = 3;
            if (this.gridCol <= margin && this.direction === 2) {
                this.direction = 0; // Turn right
            } else if (this.gridCol >= cols - margin && this.direction === 0) {
                this.direction = 2; // Turn left
            }
            if (this.gridRow <= margin && this.direction === 3) {
                this.direction = 1; // Turn down
            } else if (this.gridRow >= rows - margin && this.direction === 1) {
                this.direction = 3; // Turn up
            }
            
            // Keep within bounds
            this.gridCol = Math.max(margin, Math.min(cols - margin, this.gridCol));
            this.gridRow = Math.max(margin, Math.min(rows - margin, this.gridRow));
        }
        
        // Calculate actual position with smooth interpolation between grid points
        // Ensure exact grid alignment by using exact grid spacing
        const baseX = this.gridCol * spacing;
        const baseY = this.gridRow * spacing;
        
        const dx = [1, 0, -1, 0][this.direction];
        const dy = [0, 1, 0, -1][this.direction];
        this.x = baseX + dx * spacing * this.progress;
        this.y = baseY + dy * spacing * this.progress;
    }
}

const masses = [
    new GridNavigator(CONFIG.autonomousMass * 1.2, 0.8, 8, 5),
    new GridNavigator(CONFIG.autonomousMass * 1.0, 1.0, 15, 10),
    new GridNavigator(CONFIG.autonomousMass * 1.3, 0.9, 22, 7),
    new GridNavigator(CONFIG.autonomousMass * 1.4, 1.1, 30, 12),
    new GridNavigator(CONFIG.autonomousMass * 1.5, 1.2, 38, 9),
];

function calculatePotentialGradient(px, py, massX, massY, mass, softening) {
    const dx = px - massX;
    const dy = py - massY;
    const r2 = dx * dx + dy * dy;
    const softened = Math.sqrt(r2 + softening * softening);
    const factor = mass / (softened * softened * softened);
    
    return {
        gx: -dx * factor,
        gy: -dy * factor
    };
}

function calculateDisplacement(px, py, allMasses, mouseX, mouseY) {
    let totalGx = 0;
    let totalGy = 0;
    for (const mass of allMasses) {
        const { gx, gy } = calculatePotentialGradient(
            px, py, mass.x, mass.y, mass.mass, CONFIG.softeningLength
        );
        totalGx += gx;
        totalGy += gy;
    }
    if (mouseX > 0 && mouseY > 0) {
        const { gx, gy } = calculatePotentialGradient(
            px, py, mouseX, mouseY, CONFIG.cursorMass, CONFIG.softeningLength * 0.8
        );
        totalGx += gx;
        totalGy += gy;
    }
    const scale = 1000;
    let dx = totalGx * scale;
    let dy = totalGy * scale;
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    if (magnitude > 0) {
        const maxDisp = CONFIG.maxDisplacement;
        const limited = maxDisp * Math.tanh(magnitude / maxDisp);
        const ratio = limited / magnitude;
        dx *= ratio;
        dy *= ratio;
    }

    return { dx, dy };
}

function calculateWarpedGrid() {
    const spacing = CONFIG.gridSpacing;
    const cols = Math.ceil(width / spacing) + 4;
    const rows = Math.ceil(height / spacing) + 4;
    const offsetX = -spacing * 2;
    const offsetY = -spacing * 2;
    
    const grid = [];
    
    for (let row = 0; row <= rows; row++) {
        grid[row] = [];
        const baseY = offsetY + row * spacing;
        
        for (let col = 0; col <= cols; col++) {
            const baseX = offsetX + col * spacing;
            const { dx, dy } = calculateDisplacement(baseX, baseY, masses, smoothMouse.x, smoothMouse.y);
            grid[row][col] = {
                x: baseX + dx,
                y: baseY + dy
            };
        }
    }
    
    return { grid, rows, cols };
}

function drawGrid() {
    const { grid, rows, cols } = calculateWarpedGrid();

    ctx.strokeStyle = CONFIG.gridColor;
    ctx.lineWidth = CONFIG.gridLineWidth;
    for (let row = 0; row <= rows; row++) {
        ctx.beginPath();
        for (let col = 0; col <= cols; col++) {
            const pt = grid[row][col];
            if (col === 0) {
                ctx.moveTo(pt.x, pt.y);
            } else {
                ctx.lineTo(pt.x, pt.y);
            }
        }
        ctx.stroke();
    }
    for (let col = 0; col <= cols; col++) {
        ctx.beginPath();
        for (let row = 0; row <= rows; row++) {
            const pt = grid[row][col];
            if (row === 0) {
                ctx.moveTo(pt.x, pt.y);
            } else {
                ctx.lineTo(pt.x, pt.y);
            }
        }
        ctx.stroke();
    }
}

function drawNodes() {
    for (const mass of masses) {
        const { dx, dy } = calculateDisplacement(mass.x, mass.y, 
            masses.filter(m => m !== mass), smoothMouse.x, smoothMouse.y);
        const nodeX = mass.x + dx * 0.3;
        const nodeY = mass.y + dy * 0.3;
        ctx.beginPath();
        ctx.arc(nodeX, nodeY, CONFIG.nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.nodeColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(nodeX, nodeY, CONFIG.nodeRadius * 2.2, 0, Math.PI * 2);
        ctx.strokeStyle = CONFIG.nodeRingColor;
        ctx.lineWidth = 0.6;
        ctx.stroke();
    }
}

let lastTime = 0;
function animate(currentTime) {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;
    const smoothing = 0.15;
    smoothMouse.x += (mouse.x - smoothMouse.x) * smoothing;
    smoothMouse.y += (mouse.y - smoothMouse.y) * smoothing;
    ctx.clearRect(0, 0, width, height);
    for (const mass of masses) mass.update(dt);
    drawGrid();
    drawNodes();
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function initMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const nav = document.querySelector('.nav');
    const navRight = document.querySelector('.nav-right');

    if (!mobileMenuToggle || !nav || !navRight) return;

    function closeMobileMenu() {
        nav.classList.remove('mobile-open');
        mobileMenuToggle.classList.remove('active');
    }

    mobileMenuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        nav.classList.toggle('mobile-open');
        mobileMenuToggle.classList.toggle('active');
    });
    document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', closeMobileMenu));
    navRight.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', (e) => {
        if (nav.classList.contains('mobile-open') && !navRight.contains(e.target) && !mobileMenuToggle.contains(e.target)) closeMobileMenu();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nav.classList.contains('mobile-open')) closeMobileMenu();
    });
}

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); });
}, { threshold: 0.15 });
document.querySelectorAll('.fade-in, .fade-in-item').forEach(el => {
    if (el.classList.contains('hero')) setTimeout(() => el.classList.add('is-visible'), 100);
    observer.observe(el);
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
        const href = anchor.getAttribute('href');
        if (href === '#' || href === '#top') return;
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 100, behavior: 'smooth' });
    });
});

const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || (isLightMode() ? 'light' : 'dark');
        setTheme(current === 'light' ? 'dark' : 'light');
    });
}

function handleNavbarScroll() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const threshold = 100;
    const on = window.scrollY > threshold || hero.getBoundingClientRect().bottom < threshold;
    document.body.classList.toggle('scrolled', on);
}
window.addEventListener('scroll', handleNavbarScroll);
window.addEventListener('resize', handleNavbarScroll);
handleNavbarScroll();

function initContactForm() {
    const form = document.getElementById('contact-form');
    const result = document.getElementById('form-result');
    const submitButton = form?.querySelector('.form-submit');
    
    if (!form || !result) return;
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(form);
        const object = Object.fromEntries(formData);
        const json = JSON.stringify(object);
        
        result.innerHTML = "Please wait...";
        result.className = "form-message show";
        
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Sending...";
        }
        
        fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: json
        })
        .then(async (response) => {
            const json = await response.json();
            const ok = response.status === 200;
            result.innerHTML = ok ? json.message : (json.message || "Something went wrong. Please try again.");
            result.className = "form-message show " + (ok ? "success" : "error");
        })
        .catch(() => {
            result.innerHTML = "Something went wrong! Please try again or email us directly at contact@gridworld.ai";
            result.className = "form-message show error";
        })
        .finally(() => {
            if (submitButton) { submitButton.disabled = false; submitButton.textContent = "Submit"; }
            form.reset();
            setTimeout(() => { result.className = "form-message"; result.innerHTML = ""; }, 5000);
        });
    });
}

function initImageProtection() {
    const images = document.querySelectorAll('img:not(.logo img):not(.footer-logo img)');
    images.forEach(img => {
        img.addEventListener('contextmenu', (e) => e.preventDefault());
        img.addEventListener('selectstart', (e) => e.preventDefault());
    });
    document.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'IMG' && !e.target.closest('.logo') && !e.target.closest('.footer-logo')) e.preventDefault();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initMobileMenu(); initContactForm(); initImageProtection(); });
} else {
    initMobileMenu();
    initContactForm();
    initImageProtection();
}

