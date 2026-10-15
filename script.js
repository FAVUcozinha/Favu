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


// =====================================================================
// TEMA DO SITE (2026-10-15): cores + imagens do tema aplicado no painel.
// Campos em branco mantêm o visual padrão do site. Fundos aceitam degradê.
// =====================================================================
function aplicarTemaSite(t) {
    if (!t) return;
    const root = document.documentElement;
    const ehCardapio = !!document.getElementById('menu-principal');
    const ehDegrade = v => /gradient\(/i.test(String(v || ''));
    const primeiraCor = v => (String(v || '').match(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/i) || [''])[0];
    const r = [];
    const fundo = ehCardapio ? (t.bgCardapio || t.bg) : t.bg;
    if (fundo) {
        if (ehDegrade(fundo)) {
            const c = primeiraCor(fundo); if (c) root.style.setProperty('--bg-color', c);
            r.push(`body { background: ${fundo} !important; background-attachment: fixed !important; }`);
        } else root.style.setProperty('--bg-color', fundo);
    }
    if (t.card) root.style.setProperty('--card-bg', t.card); else root.style.removeProperty('--card-bg');
    if (t.txt) root.style.setProperty('--text-dark', t.txt); else root.style.removeProperty('--text-dark');
    if (t.acc) { root.style.setProperty('--accent-orange', t.acc); root.style.setProperty('--accent-rust', t.acc); }
    // "__sem__" = o tema pediu para não ter imagem nesse lugar.
    const SEM = '__sem__';
    // Guarda a imagem original para voltar a ela quando o campo fica vazio (prévia ao vivo).
    const trocarImg = (sel, v) => { document.querySelectorAll(sel).forEach(img => {
        if (img.dataset.orig === undefined) img.dataset.orig = img.getAttribute('src') || '';
        if (!v) { img.style.display = ''; img.src = img.dataset.orig; }
        else if (v === SEM) img.style.display = 'none';
        else { img.style.display = ''; img.src = v; } }); };
    const trocarFundo = (sel, v) => { const el = document.querySelector(sel); if (!el) return; el.style.backgroundImage = !v ? '' : (v === SEM ? 'none' : `url('${v}')`); };
    trocarImg('.hero-logo-big', t.logoPrincipal);
    trocarImg('.menu-logo-img', t.logoMenu || t.logoPrincipal);
    trocarImg('.footer-logo', t.logoRodape);
    trocarFundo('header', t.imgTopo);
    trocarFundo('footer', t.imgRodape);
    trocarImg('#aboutModal .modal-img', t.imgQuemSomos);
    // Regras de cada elemento, já prontas no tema (painel > Temas).
    (Array.isArray(t.regrasCss) ? t.regrasCss : []).forEach(x => r.push(x));

    const add = (cor, regra) => { if (cor) r.push(regra.replace(/\$C/g, cor)); };
    add(t.corMenuLateral, '.side-menu { background: $C !important; }');
    add(t.corIconesBotoes, '.card-icon, .card-icon i { color: $C !important; }');
    add(t.corBotoes, '.clean-card, .btn-primary { background: $C !important; }');
    add(t.corTextoBotoes, '.card-info h3, .btn-primary { color: $C !important; }');
    add(t.corLegendaBotoes, '.card-info p { color: $C !important; }');
    add(t.corTituloCategorias, '.categoria-title { color: $C !important; }');
    add(t.corBotoesCategorias, '#categorias-horizontal a:not(.active-link) { background: $C !important; }');
    add(t.corTextoCategorias, '#categorias-horizontal a:not(.active-link) { color: $C !important; }');
    add(t.corFundoItens, '.table-card { background: $C !important; }');
    add(t.corTituloItens, 'td.col-item, td.col-item .item-nome-texto { color: $C !important; }');
    add(t.corDescricoes, '.descricao, .peso-mobile { color: $C !important; }');
    add(t.corResumoPedido, '#fixed-summary { background: $C !important; }');
    add(t.corFundoResumo, '#popup-resumo .popup-conteudo, #popup-resumo #cupom-container strong { background: $C !important; }');
    add(t.corBotoesResumo, '#popup-resumo .btn-fazer-pedido, #popup-resumo .btn-primary-large, #popup-resumo #apply-cupom-btn { background: $C !important; }');
    add(t.corFundoInfoPedido, '#popup-pedido .popup-conteudo { background: $C !important; }');
    add(t.corBotoesInfoPedido, '#popup-pedido .btn-primary-large { background: $C !important; }');
    let tag = document.getElementById('tema-dinamico');
    if (!tag) { tag = document.createElement('style'); tag.id = 'tema-dinamico'; document.head.appendChild(tag); }
    tag.textContent = r.join('\n');
}

// Prévia ao vivo (editor de temas do painel): recebe o tema que está sendo editado
// e faz piscar o elemento que a pessoa clicou.
function prepararPreviaAoVivo() {
    if (window.__aoVivoPronto) return;
    window.__aoVivoPronto = true;
    const st = document.createElement('style');
    st.textContent = '.favu-destaque{outline:3px dashed #E60000 !important;outline-offset:3px !important;animation:favuPisca 1s ease 3;} @keyframes favuPisca{50%{outline-color:transparent;}}';
    document.head.appendChild(st);
    window.addEventListener('message', async (ev) => {
        if (ev.origin !== location.origin || !ev.data) return;
        if (ev.data.tipo === 'favu-tema-ao-vivo') {
            try { aplicarTemaSite(await resolverImagensTema(ev.data.dados || {})); } catch (e) {}
        }
        if (ev.data.tipo === 'favu-destacar') {
            document.querySelectorAll('.favu-destaque').forEach(e => e.classList.remove('favu-destaque'));
            const abrir = ev.data.abrir || '';
            const menu = document.getElementById('side-menu');
            if (menu) menu.classList.toggle('active', abrir === 'menu');
            const about = document.getElementById('aboutModal');
            if (about) { if (abrir === 'quemsomos') { about.classList.add('show'); about.style.display = 'flex'; } else { about.classList.remove('show'); about.style.display = ''; } }
            ['resumo', 'info'].forEach(n => {
                const pop = document.getElementById(n === 'resumo' ? 'popup-resumo' : 'popup-pedido');
                if (!pop) return;
                if (abrir === n) { pop.style.display = 'flex'; pop.classList.add('show'); } else { pop.style.display = 'none'; pop.classList.remove('show'); }
            });
            if (!ev.data.seletor) return;
            setTimeout(() => {
                const els = document.querySelectorAll(ev.data.seletor);
                els.forEach(e => e.classList.add('favu-destaque'));
                if (els[0]) els[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 250);
        }
    });
}

// Prévia (painel > Temas > Prévia): ?tema_previa=<id> carrega o tema da lista,
// já com o que ele herda do tema Padrão, sem precisar aplicar no site.
async function obterTemaParaAplicar() {
    const idPrevia = new URLSearchParams(location.search).get('tema_previa');
    if (idPrevia) {
        try {
            if (new URLSearchParams(location.search).has('ao_vivo')) prepararPreviaAoVivo();
            const snap = await getDoc(doc(db, 'config', 'temas_lista'));
            const lista = snap.exists() ? (snap.data().temas || []) : [];
            const t = lista.find(x => x.id === idPrevia);
            const padrao = lista.find(x => x.id === 'padrao') || {};
            if (t) {
                const efetivo = {};
                new Set([...Object.keys(padrao), ...Object.keys(t)]).forEach(k => { efetivo[k] = t[k] || (t.id !== 'padrao' ? padrao[k] : '') || ''; });
                document.querySelectorAll('a[href]').forEach(a => {
                    const href = a.getAttribute('href') || '';
                    if (/(^|\/)(index|cardapio)\.html/.test(href) || href === './') a.setAttribute('href', href + (href.includes('?') ? '&' : '?') + 'tema_previa=' + encodeURIComponent(idPrevia));
                });
                const aviso = document.createElement('div');
                aviso.textContent = `Prévia do tema: ${t.nome || ''}`;
                aviso.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:99999;background:#1D2814;color:#fff;padding:6px 14px;border-radius:20px;font:12px sans-serif;opacity:.85;pointer-events:none;';
                document.body.appendChild(aviso);
                return efetivo;
            }
        } catch (e) {}
    }
    // Tema agendado (painel > Temas > Agendamento): vale dentro do período.
    try {
        const ag = await getDoc(doc(db, 'config', 'tema_agendados'));
        const agora = Date.now();
        const vigentes = (ag.exists() ? (ag.data().lista || []) : []).filter(x => x && x.dados && (x.inicio == null || agora >= x.inicio) && (x.fim == null || agora < x.fim));
        if (vigentes.length) return vigentes.sort((a, b) => (b.inicio || 0) - (a.inicio || 0))[0].dados;
    } catch (e) {}
    const temaDoc = await getDoc(doc(db, "config", "tema"));
    return temaDoc.exists() ? temaDoc.data() : null;
}

// As imagens do tema ficam em documentos separados (config/tema_img_...), porque
// juntas passavam do limite de 1 MB do Firestore. O tema guarda "cfgimg:<id>".
async function resolverImagemTema(valor) {
    const v = String(valor || '');
    if (!v.startsWith('cfgimg:')) return v;
    const id = v.slice(7);
    try { const c = localStorage.getItem('favu_img_' + id); if (c) return c; } catch (e) {}
    try {
        const s = await getDoc(doc(db, 'config', id));
        const data = s.exists() ? (s.data().data || '') : '';
        try { if (data) localStorage.setItem('favu_img_' + id, data); } catch (e) {}
        return data;
    } catch (e) { return ''; }
}
async function resolverImagensTema(t) {
    const campos = ['logoPrincipal', 'logoMenu', 'imgTopo', 'imgRodape', 'logoRodape', 'imgQuemSomos'];
    const valores = await Promise.all(campos.map(k => resolverImagemTema(t[k])));
    const out = { ...t };
    campos.forEach((k, i) => { out[k] = valores[i]; });
    return out;
}


// =====================================================================
// EDITOR DO SITE (painel > Layout > Página inicial / Cardápio) — 2026-10-15
// Se config/site_inicio ou config/site_cardapio existirem, os botões, links,
// redes sociais e textos vêm de lá. Senão, o site fica como sempre foi.
// Ações: link | quem_somos | cardapio | inicio | whatsapp | instagram
// =====================================================================
function escSite(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function hrefAcaoSite(item) {
    const acao = item.acao || 'link';
    const link = String(item.link || '').trim();
    if (acao === 'quem_somos') return { href: '#', abreQuemSomos: true };
    if (acao === 'cardapio') return { href: link || 'cardapio.html' };
    if (acao === 'inicio') return { href: link || 'index.html' };
    if (acao === 'whatsapp') { const n = link.replace(/\D/g, ''); return { href: n ? `https://wa.me/${n}` : link, externo: true }; }
    return { href: link || '#', externo: /^https?:/i.test(link) };
}
function linkSiteHtml(item, classe, conteudo) {
    const a = hrefAcaoSite(item);
    const alvo = a.externo ? ' target="_blank" rel="noopener"' : '';
    const clique = a.abreQuemSomos ? ' onclick="event.preventDefault(); window.openAboutModal && window.openAboutModal();"' : '';
    return `<a href="${escSite(a.href)}" class="${classe}"${alvo}${clique}>${conteudo}</a>`;
}
const visiveisSite = lista => (Array.isArray(lista) ? lista : []).filter(i => i && i.visivel !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
function aplicarMenuLateralSite(dados) {
    if (Array.isArray(dados.menuLateral)) {
        const ul = document.querySelector('#side-menu .nav-links');
        if (ul) ul.innerHTML = visiveisSite(dados.menuLateral).map(i => `<li>${linkSiteHtml(i, 'menu-link', escSite(i.titulo))}</li>`).join('');
    }
    if (Array.isArray(dados.redes)) {
        const box = document.querySelector('#side-menu .menu-socials');
        if (box) box.innerHTML = visiveisSite(dados.redes).map(i => linkSiteHtml(i, 'menu-social-link', `<i class="${escSite(i.icone || 'fas fa-link')}"></i> ${escSite(i.titulo)}`)).join('');
    }
}
function aplicarQuemSomosSite(qs) {
    if (!qs) return;
    const corpo = document.querySelector('#aboutModal .modal-text');
    const fmt = v => (window.formatText ? window.formatText(v) : v);
    if (corpo && (qs.texto || qs.destaque)) corpo.innerHTML = (qs.texto ? fmt(qs.texto) : '') + (qs.destaque ? `<p class="highlight">${fmt(qs.destaque)}</p>` : '');
    const btn = document.querySelector('#aboutModal .btn-primary');
    if (btn) {
        if (qs.botaoVisivel === false) btn.style.display = 'none';
        else {
            if (qs.botaoTexto) btn.textContent = qs.botaoTexto;
            if (qs.botaoLink) { const a = hrefAcaoSite({ acao: qs.botaoAcao || 'link', link: qs.botaoLink }); btn.setAttribute('href', a.href); }
        }
    }
}
function aplicarRodapeSite(r) {
    if (!r) return;
    if (r.copyright) document.querySelectorAll('footer .copy').forEach(p => { p.textContent = r.copyright; });
    if (r.assinatura) document.querySelectorAll('footer .desktop-signature span').forEach(s => { s.textContent = r.assinatura; });
}
async function carregarDadosSite(id) {
    try { const d = await getDoc(doc(db, 'config', id)); return d.exists() ? d.data() : null; } catch (e) { return null; }
}

document.addEventListener("DOMContentLoaded", async function () {
    
    // APLICAR TEMA (CORES + IMAGENS)
    try {
        const temaAtual = await obterTemaParaAplicar();
        if (temaAtual) aplicarTemaSite(await resolverImagensTema(temaAtual));
    } catch(e) {}

    // EDITOR DO SITE: botões da capa, menu lateral, redes, Quem somos e rodapé
    const siteInicio = await carregarDadosSite('site_inicio');
    if (siteInicio) {
        if (Array.isArray(siteInicio.botoesCapa)) {
            const grid = document.getElementById('dynamic-grid-links');
            if (grid) grid.innerHTML = visiveisSite(siteInicio.botoesCapa).map(i => linkSiteHtml(i, 'clean-card',
                `<div class="card-icon"><i class="${escSite(i.icone || 'fas fa-link')}"></i></div><div class="card-info"><h3 class="font-display">${escSite(i.titulo)}</h3><p class="font-body">${window.formatText(i.legenda || '')}</p></div>`)).join('');
        }
        aplicarMenuLateralSite(siteInicio);
        aplicarQuemSomosSite(siteInicio.quemSomos);
        aplicarRodapeSite(siteInicio.rodape);
    }

    // CARREGAR BOTÕES DO MENU LATERAL (SANFONA)
    if (!siteInicio) try {
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
    if (!siteInicio) try {
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
            // Respeita a ordem definida no painel (Layout > Imagens do Carrossel).
            const fotos = [];
            carSnap.forEach(d => fotos.push(d.data()));
            fotos.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
            fotos.forEach(f => { if (f.url) arrayImagens.push(`<div class="slide-item"><img src="${f.url}" loading="lazy"></div>`); });
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