import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const app = initializeApp({
    apiKey: "AIzaSyD5JlV7R2w629uiescD4AiixNAr-Qt0qI0",
    authDomain: "favu-app.firebaseapp.com",
    projectId: "favu-app"
});
const db = getFirestore(app);

// ==========================================
// FORMATADOR DE TEXTO RICO SEGURO
// Interpreta o HTML salvo pelo admin (negrito, itálico, sublinhado
// e alinhamentos) sem exibir as tags como texto na tela do cliente.
// ==========================================
window.formatText = function(text) {
    if (!text) return '';

    const container = document.createElement('div');
    container.innerHTML = String(text).replace(/\n/g, '<br>');

    const allowedTags = ['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'SPAN'];
    const dangerousTags = ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'LINK', 'META'];
    const allowedAlignments = ['left', 'right', 'center', 'justify'];
    const walk = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null);
    const nodes = [];

    while (walk.nextNode()) nodes.push(walk.currentNode);

    nodes.forEach(node => {
        if (dangerousTags.includes(node.tagName)) {
            node.remove();
            return;
        }

        if (!allowedTags.includes(node.tagName)) {
            node.replaceWith(...Array.from(node.childNodes));
            return;
        }

        let textAlign = '';
        const styleAttr = node.getAttribute('style') || '';
        const styleMatch = styleAttr.match(/text-align\s*:\s*(left|right|center|justify)/i);
        const alignAttr = (node.getAttribute('align') || '').toLowerCase();

        if (styleMatch) textAlign = styleMatch[1].toLowerCase();
        if (!textAlign && allowedAlignments.includes(alignAttr)) textAlign = alignAttr;

        Array.from(node.attributes).forEach(attr => node.removeAttribute(attr.name));

        if (allowedAlignments.includes(textAlign)) {
            node.style.textAlign = textAlign;
        }
    });

    const textWalk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (textWalk.nextNode()) textNodes.push(textWalk.currentNode);

    textNodes.forEach(textNode => {
        const value = textNode.nodeValue || '';
        if (!/[\*_]/.test(value)) return;

        const parts = value.split(/(\*(?!\s)[^*]+?\*|_(?!\s)[^_]+?_)/g);
        const fragment = document.createDocumentFragment();
        let changed = false;

        parts.forEach(part => {
            if (/^\*(?!\s)([^*]+?)\*$/.test(part)) {
                const strong = document.createElement('strong');
                strong.textContent = part.slice(1, -1);
                fragment.appendChild(strong);
                changed = true;
            } else if (/^_(?!\s)([^_]+?)_$/.test(part)) {
                const em = document.createElement('em');
                em.textContent = part.slice(1, -1);
                fragment.appendChild(em);
                changed = true;
            } else if (part) {
                fragment.appendChild(document.createTextNode(part));
            }
        });

        if (changed) textNode.replaceWith(fragment);
    });

    return container.innerHTML
        .replace(/<div><br><\/div>/gi, '<br>')
        .replace(/<p><br><\/p>/gi, '<br>')
        .trim();
};

document.addEventListener("DOMContentLoaded", async function () {
    
    // APLICAR TEMA (CORES)
    try {
        const temaDoc = await getDoc(doc(db, "config", "tema"));
        if (temaDoc.exists()) {
            const t = temaDoc.data();
            const root = document.documentElement;
            if(t.bg) root.style.setProperty('--bg-color', t.bg);
            if(t.card) root.style.setProperty('--card-bg', t.card);
            if(t.txt) root.style.setProperty('--text-dark', t.txt);
            if(t.acc) root.style.setProperty('--accent-orange', t.acc);
            if(t.acc) root.style.setProperty('--accent-rust', t.acc);
        }
    } catch(e) {}

    // CARREGAR BOTÕES DO MENU LATERAL (SANFONA)
    try {
        const latSnap = await getDocs(collection(db, "botoes_menu"));
        if (!latSnap.empty) {
            const navLinks = document.getElementById("dynamic-nav-links");
            navLinks.innerHTML = ""; // Só limpa se houver dados no banco
            latSnap.forEach(d => {
                const i = d.data();
                navLinks.innerHTML += `<li><a href="${i.link}" class="menu-link">${i.titulo}</a></li>`;
            });
        }
    } catch(e) {}

    // CARREGAR BOTÕES DA CAPA (GRID CARDS)
    try {
        const capaSnap = await getDocs(collection(db, "botoes_capa"));
        if (!capaSnap.empty) {
            const gridLinks = document.getElementById("dynamic-grid-links");
            gridLinks.innerHTML = ""; // Só limpa se houver dados no banco
            capaSnap.forEach(d => {
                const i = d.data();
                // Aplicando a formatação no texto de descrição
                const descFormatada = window.formatText(i.desc);
                
                gridLinks.innerHTML += `
                    <a href="${i.link}" class="clean-card">
                        <div class="card-icon"><i class="${i.icon}"></i></div>
                        <div class="card-info"><h3 class="font-display">${i.titulo}</h3><p class="font-body">${descFormatada}</p></div>
                    </a>`;
            });
        }
    } catch(e) {}

    // CARREGAR CARROSSEL (COM CLONADOR INTELIGENTE)
    const track = document.getElementById('slideshow-track');
    let arrayImagens = [];
    
    try {
        const carSnap = await getDocs(collection(db, "carrossel"));
        if (!carSnap.empty) {
            carSnap.forEach(d => { 
                arrayImagens.push(`<div class="slide-item"><img src="${d.data().url}" loading="lazy"></div>`); 
            });
        }
    } catch(e) { console.error("Erro ao carregar carrossel", e); }

    // FALLBACK: Se o banco estiver vazio, puxa as 23 originais da FAVU
    if (arrayImagens.length === 0) {
        for (let i = 1; i <= 23; i++) {
            const num = i.toString().padStart(2, '0');
            arrayImagens.push(`<div class="slide-item"><img src="images/S${num}.jpg" loading="lazy" alt="Delícia FAVU"></div>`);
        }
    }

    // CLONADOR INTELIGENTE: Se o usuário subiu poucas fotos (ex: 3), 
    // nós multiplicamos elas até formar um grupo grande (ex: 15) para o loop rodar macio.
    let imagensHTML = arrayImagens.join('');
    if (arrayImagens.length > 0 && arrayImagens.length < 15) {
        const multiplicador = Math.ceil(15 / arrayImagens.length);
        imagensHTML = imagensHTML.repeat(multiplicador);
    }

    // Injeta na tela (3 vezes para fazer o truque matemático do loop)
    track.innerHTML = imagensHTML + imagensHTML + imagensHTML;
    iniciarCarrossel();

    // INTERFACE DE MENU, MODAIS E CARROSSEL LOGIC
    const sideMenu = document.getElementById('side-menu');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const aboutModal = document.getElementById('aboutModal');

    function toggleMenu(show) { sideMenu.classList[show ? 'add' : 'remove']('active'); }
    if(mobileMenuBtn) mobileMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(true); });
    if(closeMenuBtn) closeMenuBtn.addEventListener('click', () => toggleMenu(false));
    document.addEventListener('click', (e) => { if (sideMenu.classList.contains('active') && !sideMenu.contains(e.target) && e.target !== mobileMenuBtn) toggleMenu(false); });

    window.openAboutModal = function() { aboutModal.classList.add('show'); toggleMenu(false); }
    window.closeAboutModal = function() { aboutModal.classList.remove('show'); }
    window.onclick = (e) => { if(e.target == aboutModal) closeAboutModal(); }
    const qS = document.getElementById('menu-quem-somos');
    if(qS) qS.addEventListener('click', (e) => { e.preventDefault(); openAboutModal(); });

    function iniciarCarrossel() {
        const slideshow = document.getElementById('slideshow-draggable');
        let isDown = false; let startX; let scrollLeft; let autoplayInterval;
        
        setTimeout(() => { 
            slideshow.scrollLeft = slideshow.scrollWidth / 3; 
            startAutoplay(); 
        }, 100);

        function startAutoplay() {
            clearInterval(autoplayInterval);
            autoplayInterval = setInterval(() => { 
                slideshow.scrollLeft += 1; 
                checkInfiniteLoop(); 
            }, 15);
        }
        function stopAutoplay() { clearInterval(autoplayInterval); }

        function checkInfiniteLoop() {
            const w = slideshow.scrollWidth / 3;
            if (slideshow.scrollLeft >= w * 2) slideshow.scrollLeft = w;
            else if (slideshow.scrollLeft <= 0) slideshow.scrollLeft = w;
        }

        const startDrag = (e) => { 
            isDown = true; 
            stopAutoplay(); 
            slideshow.classList.add('active'); 
            startX = (e.pageX || e.touches[0].pageX) - slideshow.offsetLeft; 
            scrollLeft = slideshow.scrollLeft; 
        };
        const endDrag = () => { 
            if (!isDown) return; 
            isDown = false; 
            slideshow.classList.remove('active'); 
            startAutoplay(); 
        };
        const moveDrag = (e) => { 
            if (!isDown) return; 
            e.preventDefault(); 
            const x = (e.pageX || e.touches[0].pageX) - slideshow.offsetLeft; 
            slideshow.scrollLeft = scrollLeft - ((x - startX) * 2); 
            checkInfiniteLoop(); 
        };

        slideshow.addEventListener('mousedown', startDrag); 
        slideshow.addEventListener('mouseleave', endDrag);
        slideshow.addEventListener('mouseup', endDrag); 
        slideshow.addEventListener('mousemove', moveDrag);
        slideshow.addEventListener('touchstart', startDrag); 
        slideshow.addEventListener('touchend', endDrag);
        slideshow.addEventListener('touchmove', moveDrag);
    }
});