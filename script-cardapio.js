import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc, query, where, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5JlV7R2w629uiescD4AiixNAr-Qt0qI0",
  authDomain: "favu-app.firebaseapp.com",
  projectId: "favu-app",
  storageBucket: "favu-app.firebasestorage.app",
  messagingSenderId: "793414871188",
  appId: "1:793414871188:web:07ab447df44d742e022c81"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let configCategorias = {};
let bancoDeProdutos = {}; 
Object.defineProperty(window, '__bancoDeProdutosRef', { get: () => bancoDeProdutos });
window.totalPedidoAtivo = 0; 
window.regrasAgenda = {}; // Agenda Global

// 2026-10-15: uma data específica (aba Horários) pode valer só para algumas categorias.
// Sem categorias = vale para todos os pedidos. Com categorias = só quando o carrinho
// tem itens de alguma delas; senão, o dia segue a agenda normal.
window.regraExcecaoAplicavel = function(dataISO) {
    const regra = window.regrasAgenda ? window.regrasAgenda[dataISO] : null;
    if (!regra) return null;
    const cats = Array.isArray(regra.categorias) ? regra.categorias.filter(Boolean) : [];
    if (!cats.length) return regra;
    const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const alvo = new Set(cats.map(norm));
    const noCarrinho = new Set();
    document.querySelectorAll('.quantidade-input').forEach(input => {
        if ((parseInt(input.value) || 0) <= 0) return;
        const prod = (window.__bancoDeProdutosRef || {})[input.getAttribute('data-item-id')] || {};
        [prod.categoria, input.getAttribute('data-grupo')].forEach(c => { if (c) noCarrinho.add(norm(c)); });
    });
    for (const c of noCarrinho) if (alvo.has(c)) return regra;
    return null;
};

// ==========================================
// FORMATADOR DE TEXTO RICO SEGURO
// Interpreta o HTML salvo pelo admin (negrito, itálico, sublinhado
// e alinhamentos) sem exibir as tags como texto na tela do cliente.
// ==========================================
window.formatText = function(text) {
    if (!text) return '';

    // O admin salva texto rico em HTML. Em alguns casos antigos, esse HTML
    // pode ter sido salvo escapado como &lt;div&gt;. Quando isso acontecer,
    // decodificamos uma vez para que o cliente renderize a formatação.
    let rawText = String(text);
    if (/&lt;\/?(b|strong|i|em|u|br|div|p|span)(\s|&gt;|>)/i.test(rawText)) {
        const decoder = document.createElement('textarea');
        decoder.innerHTML = rawText;
        rawText = decoder.value;
    }

    const container = document.createElement('div');
    container.innerHTML = rawText.replace(/\n/g, '<br>');

    const allowedTags = ['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'SPAN'];
    const dangerousTags = ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'LINK', 'META'];
    const allowedAlignments = ['left', 'right', 'center', 'justify'];
    const inlineTags = ['B', 'STRONG', 'I', 'EM', 'U', 'SPAN'];
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

            // Se o navegador/admin gravar alinhamento em span/strong/em/u,
            // transformamos em bloco para que o alinhamento realmente apareça.
            if (inlineTags.includes(node.tagName)) {
                node.style.display = 'block';
            }
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

// ==============================================================
// MOTOR DE INTERVALOS (Gera horários de 30 em 30 min)
// ==============================================================
window.gerarHorarios = function(texto) {
    if (!texto || texto.trim() === '') return [];
    
    // Quebra por vírgula (ex: "8h às 12h, 15h às 18h")
    const blocos = texto.split(',').map(b => b.trim());
    let resultado = [];

    function parseHoraMinutos(str) {
        str = str.toLowerCase().replace(/[^0-9:]/g, ''); // "08:30" ou "8"
        if (str === '') return null;
        let h = 0, m = 0;
        if (str.includes(':')) {
            const p = str.split(':');
            h = parseInt(p[0]); m = parseInt(p[1] || 0);
        } else {
            h = parseInt(str);
        }
        return (h * 60) + m;
    }

    function formataHoraMinutos(minutosTotais) {
        const h = Math.floor(minutosTotais / 60);
        const m = minutosTotais % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    blocos.forEach(bloco => {
        // Separa onde tem "às", "as" ou "-" para achar intervalos
        const partes = bloco.split(/\s+(?:às|as|-)\s+/i);
        
        if (partes.length === 2) {
            // É UM INTERVALO (ex: "8h às 12h")
            let minInicio = parseHoraMinutos(partes[0]);
            let minFim = parseHoraMinutos(partes[1]);
            
            if (minInicio !== null && minFim !== null) {
                // Loop de 30 em 30 minutos!
                for (let minAtual = minInicio; minAtual <= minFim; minAtual += 30) {
                    resultado.push(formataHoraMinutos(minAtual));
                }
            }
        } else {
            // É SÓ UMA HORA PONTUAL (ex: "18h")
            let pontual = parseHoraMinutos(bloco);
            if (pontual !== null) {
                resultado.push(formataHoraMinutos(pontual));
            }
        }
    });

    // Remove duplicatas e coloca em ordem do menor pro maior horário
    return [...new Set(resultado)].sort();
};


window.filtrarHorariosDisponiveisPorAgora = function(dataISO, horarios) {
    if (!dataISO || !Array.isArray(horarios)) return horarios || [];

    const hoje = new Date();
    const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    if (dataISO !== hojeISO) return horarios;

    const minutosAgora = (hoje.getHours() * 60) + hoje.getMinutes();

    const paraMinutos = (valor) => {
        const texto = String(valor || '').trim();
        const match = texto.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        const h = Number(match[1]);
        const m = Number(match[2]);
        if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
        return (h * 60) + m;
    };

    return horarios.filter(hora => {
        const minutosHorario = paraMinutos(hora);
        if (minutosHorario === null) return true;
        return minutosHorario >= minutosAgora;
    });
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

// Textos do cardápio editáveis no painel (Layout > Cardápio).
window.__textosCardapio = { tituloResumo: 'RESUMO DO PEDIDO', botaoFazerPedido: 'FAZER PEDIDO', tituloInfo: 'INFORMAÇÕES DO PEDIDO', botaoConfirmar: 'CONFIRMAR PEDIDO', saudacaoWhatsapp: 'Olá, Favu!\nGostaria de encomendar os itens abaixo:' };
async function aplicarSiteCardapio() {
    const [cardapio, inicio] = await Promise.all([carregarDadosSite('site_cardapio'), carregarDadosSite('site_inicio')]);
    if (inicio) { aplicarQuemSomosSite(inicio.quemSomos); aplicarRodapeSite(inicio.rodape); }
    if (!cardapio) return;
    aplicarMenuLateralSite(cardapio);
    const t = cardapio.textos || {};
    Object.keys(window.__textosCardapio).forEach(k => { if (t[k] && String(t[k]).trim()) window.__textosCardapio[k] = String(t[k]); });
    const h1 = document.querySelector('#popup-resumo h2'); if (h1) h1.textContent = window.__textosCardapio.tituloResumo;
    const h2 = document.querySelector('#popup-pedido h2'); if (h2) h2.textContent = window.__textosCardapio.tituloInfo;
    const bc = document.querySelector('#popup-pedido .btn-primary-large'); if (bc) bc.textContent = window.__textosCardapio.botaoConfirmar;
}
document.addEventListener("DOMContentLoaded", async function () {
    
    // Tema Cores + Imagens
    try {
        aplicarSiteCardapio();
        const temaAtual = await obterTemaParaAplicar();
        if (temaAtual) aplicarTemaSite(await resolverImagensTema(temaAtual));
    } catch(e) {}

    // Agenda de Horários Globais e Exceções
    window.configGeralAgenda = {}; 
    window.regrasAgenda = {};
    
    async function carregarAgenda() {
        try {
            // 1. Puxa a Regra Geral (Dias da semana padrão: Dom a Sáb)
            const docGeral = await getDoc(doc(db, "config", "agenda_geral"));
            if (docGeral.exists()) {
                window.configGeralAgenda = docGeral.data();
            }

            // 2. Puxa as Exceções (Dias específicos fechados ou com horário diferente)
            const docExcecoes = await getDoc(doc(db, "config", "agenda_excecoes"));
            if (docExcecoes.exists()) {
                window.regrasAgenda = docExcecoes.data(); 
            }
        } catch(e) { console.error("Erro ao carregar agenda", e); }
    }
    await carregarAgenda();

    
    // === CLIENTE 2026-06-21: ampliar imagens de produtos e comunicados ===
    window.abrirZoomImagem = function(src) {
        if (!src) return;

        let modal = document.getElementById('popup-zoom-imagem');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'popup-zoom-imagem';
            modal.className = 'modal popup-zoom-imagem';
            modal.innerHTML = `
                <div class="zoom-imagem-backdrop" onclick="window.fecharZoomImagem()"></div>
                <div class="zoom-imagem-content">
                    <button type="button" class="zoom-imagem-close" onclick="window.fecharZoomImagem()">×</button>
                    <img id="zoom-imagem-display" src="" alt="Imagem ampliada">
                </div>
            `;
            document.body.appendChild(modal);
        }

        const img = document.getElementById('zoom-imagem-display');
        if (img) img.src = src;

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 20);
        document.body.style.overflow = 'hidden';
    };

    window.fecharZoomImagem = function() {
        const modal = document.getElementById('popup-zoom-imagem');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            const img = document.getElementById('zoom-imagem-display');
            if (img) img.src = '';
            document.body.style.overflow = 'auto';
        }, 200);
    };


    
    function getAvisoImagensCliente(aviso) {
        const imgs = [];
        if (Array.isArray(aviso?.imagensUrls)) aviso.imagensUrls.forEach(url => { if (url && !imgs.includes(url)) imgs.push(url); });
        if (aviso?.imagemUrl && !imgs.includes(aviso.imagemUrl)) imgs.push(aviso.imagemUrl);
        return imgs;
    }

    // NOVO (2026-10): carrossel do comunicado. Uma imagem por vez, centralizada,
    // passando sozinha em loop (como o da página inicial). Desliza com o dedo e
    // tem bolinhas embaixo da imagem. Sem setas por cima da imagem.
    function iniciarCarrosselAviso(root) {
        const carrossel = root.querySelector('.aviso-carousel');
        if (!carrossel) return;
        const track = carrossel.querySelector('.aviso-carousel-track');
        const total = Number(carrossel.dataset.total) || 1;
        if (!track || total < 2) return;
        const dots = Array.from(carrossel.querySelectorAll('.aviso-carousel-dots span'));
        // Clone da primeira no fim para o loop não "voltar correndo".
        const clone = track.firstElementChild.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);

        let atual = 0, pausadoAte = 0, arrastando = false, inicioX = 0, deltaX = 0;
        const aplicar = (animar) => {
            track.style.transition = animar ? 'transform .55s ease' : 'none';
            track.style.transform = `translateX(${-atual * 100}%)`;
            dots.forEach((d, idx) => d.classList.toggle('ativo', idx === (atual % total)));
        };
        const irPara = (i) => {
            if (i < 0) { atual = total; aplicar(false); void track.offsetWidth; i = total - 1; }
            atual = i;
            aplicar(true);
        };
        track.addEventListener('transitionend', () => {
            if (atual >= total) { atual = 0; aplicar(false); }
        });
        const pausar = () => { pausadoAte = Date.now() + 6000; };

        const xDe = (e) => (e.touches ? e.touches[0].clientX : e.clientX);
        const comecar = (e) => { arrastando = true; inicioX = xDe(e); deltaX = 0; pausar(); track.style.transition = 'none'; };
        const mover = (e) => {
            if (!arrastando) return;
            deltaX = xDe(e) - inicioX;
            const largura = carrossel.clientWidth || 1;
            track.style.transform = `translateX(calc(${-atual * 100}% + ${deltaX}px))`;
            if (Math.abs(deltaX) > 8 && e.cancelable) e.preventDefault();
            if (Math.abs(deltaX) > largura) deltaX = Math.sign(deltaX) * largura;
        };
        const terminar = () => {
            if (!arrastando) return;
            arrastando = false;
            const limite = Math.min(60, (carrossel.clientWidth || 300) * 0.15);
            if (deltaX <= -limite) irPara(atual + 1);
            else if (deltaX >= limite) irPara(atual - 1);
            else aplicar(true);
            if (Math.abs(deltaX) > 8) carrossel.dataset.arrastou = '1';
            setTimeout(() => { delete carrossel.dataset.arrastou; }, 50);
        };
        track.addEventListener('touchstart', comecar, { passive: true });
        track.addEventListener('touchmove', mover, { passive: false });
        track.addEventListener('touchend', terminar);
        track.addEventListener('mousedown', (e) => { e.preventDefault(); comecar(e); });
        window.addEventListener('mousemove', mover);
        window.addEventListener('mouseup', terminar);
        // Não abre o zoom quando o toque foi para deslizar.
        track.addEventListener('click', (e) => { if (carrossel.dataset.arrastou) { e.stopPropagation(); e.preventDefault(); } }, true);
        dots.forEach((d, idx) => d.addEventListener('click', () => { pausar(); irPara(idx); }));

        aplicar(false);
        clearInterval(window.__avisoCarrosselTimer);
        window.__avisoCarrosselTimer = setInterval(() => {
            if (!document.body.contains(track)) return clearInterval(window.__avisoCarrosselTimer);
            if (arrastando || Date.now() < pausadoAte) return;
            irPara(atual + 1);
        }, 3500);
    }

    function renderAvisoPopupContent(aviso) {
        const texto = window.formatText(aviso?.texto || '');
        const posicaoImagem = (aviso?.posicaoImagem || 'top').toLowerCase() === 'bottom' ? 'bottom' : 'top';
        const avisoImgs = getAvisoImagensCliente(aviso);
        // NOVO (2026-10): várias imagens viram um carrossel (uma por vez, passa sozinho
        // e o cliente pode deslizar para os lados), igual ao da página inicial.
        const variasImgs = avisoImgs.length > 1;
        const imagemHtml = avisoImgs.length
            ? `<div class="aviso-popup-image aviso-popup-image-${posicaoImagem} aviso-carousel" data-total="${avisoImgs.length}">
                <div class="aviso-carousel-viewport"><div class="aviso-carousel-track">${avisoImgs.map((url, idx) => `<div class="aviso-carousel-slide"><img src="${url}" alt="Imagem do comunicado ${idx + 1}" class="imagem-ampliavel" draggable="false" onclick="window.abrirZoomImagem(this.src)"></div>`).join('')}</div></div>
                ${variasImgs ? `<div class="aviso-carousel-dots">${avisoImgs.map((_, idx) => `<span class="${idx === 0 ? 'ativo' : ''}"></span>`).join('')}</div>` : ''}
            </div>`
            : '';

        return `
            <div class="aviso-popup-body aviso-popup-img-${posicaoImagem}">
                ${posicaoImagem === 'top' ? imagemHtml : ''}
                <div class="aviso-popup-text">${texto}</div>
                ${posicaoImagem === 'bottom' ? imagemHtml : ''}
            </div>
        `;
    }

    async function carregarAvisos() {
        try {
            const avisosSnap = await getDocs(collection(db, "avisos"));
            const agora = Date.now();
            const avisosAtivos = [];

            avisosSnap.forEach(docItem => {
                const a = docItem.data();
                const inicio = Number(a?.inicio) || 0;
                const fim = Number(a?.fim) || 0;
                const ativo = a?.ativo !== false;
                const dentroDoPeriodo = (!inicio || agora >= inicio) && (!fim || agora <= fim);

                if (ativo && dentroDoPeriodo) {
                    avisosAtivos.push(a);
                }
            });

            if (!avisosAtivos.length) return;

            avisosAtivos.sort((a, b) => {
                const ordemA = Number.isFinite(Number(a?.ordem)) ? Number(a.ordem) : Number(a?.inicio) || 0;
                const ordemB = Number.isFinite(Number(b?.ordem)) ? Number(b.ordem) : Number(b?.inicio) || 0;
                return ordemA - ordemB;
            });

            const aviso = avisosAtivos[0];
            const popup = document.getElementById('popup-aviso');
            const tituloEl = document.getElementById('aviso-titulo');
            const textoEl = document.getElementById('aviso-texto');

            if (popup && tituloEl && textoEl) {
                const titulo = (aviso?.titulo || '').trim();
                tituloEl.textContent = titulo;
                tituloEl.style.display = titulo ? 'block' : 'none';
                textoEl.innerHTML = renderAvisoPopupContent(aviso);
                popup.style.display = 'flex';
                setTimeout(() => popup.classList.add('show'), 50);
                setTimeout(() => iniciarCarrosselAviso(textoEl), 120);
            }
        } catch (e) {
            console.error('Erro ao carregar avisos:', e);
        }
    }
    carregarAvisos();

    window.onclick = function(e) {
        if (e.target.classList.contains('modal') || e.target.classList.contains('popup')) {
            if (e.target.id === 'popup-pedido' || e.target.id === 'popup-resumo') return;
            e.target.classList.remove('show');
            setTimeout(() => {
                e.target.style.display = 'none';
                document.body.style.overflow = 'auto';
            }, 300);
        }
    }

    async function carregarMenu() {
        try {
            const catSnapshot = await getDocs(collection(db, "categorias"));
            const categoriasAtivas = []; 
            
            catSnapshot.forEach(doc => {
                const c = doc.data();
                let estaVisivel = c.ativo !== false;
                
                if (estaVisivel && c.agendarVisibilidade) {
                    const agora = Date.now();
                    const inicio = c.inicio || null;
                    const fim = c.fim || null;

                    if (inicio && agora < inicio) estaVisivel = false;
                    if (fim && agora > fim) estaVisivel = false;
                }

                if (estaVisivel) { 
                    categoriasAtivas.push(c.nome);
                    configCategorias[c.nome] = { 
                        idGrupo: `grupo-${c.nome.toLowerCase().replace(/\s/g, '-')}`, 
                        idTabela: `tabela-${c.nome.toLowerCase().replace(/\s/g, '-')}`, 
                        minTotal: c.minTotal || 0, minIndividual: c.minIndividual || false,
                        tipoColuna: c.tipoColuna || 'Tamanho', mensagemObs: c.mensagemObs || '',
                        // Datas permitidas para retirada (AAAA-MM-DD). Em branco = agenda normal.
                        entregaInicioData: c.entregaInicioData || '',
                        entregaFimData: c.entregaFimData || '',
                        entregaMensagem: c.entregaMensagem || ''
                    };
                }
            });

            const q = query(collection(db, "produtos"), where("ativo", "==", true));
            const querySnapshot = await getDocs(q);
            const itensAgrupados = {};

            querySnapshot.forEach((doc) => {
                const item = { idFirebase: doc.id, ...doc.data() };
                const nomeCategoria = item.categoria || 'Geral';
                
                if (!categoriasAtivas.includes(nomeCategoria)) return; 

                // ID único do produto no cardápio.
                // Antes o ID era gerado por nome + tamanho. Quando existiam produtos com o mesmo
                // nome/tamanho, o botão atualizava outro input com o mesmo data-item-id: o item entrava
                // no resumo, mas a caixinha visual clicada continuava zerada.
                item.id = doc.id;
                bancoDeProdutos[item.id] = item; 

                if (!configCategorias[nomeCategoria]) {
                    configCategorias[nomeCategoria] = { 
                        idGrupo: `grupo-${nomeCategoria.toLowerCase().replace(/\s/g, '-')}`, 
                        idTabela: `tabela-${nomeCategoria.toLowerCase().replace(/\s/g, '-')}`, 
                        minTotal: 0, minIndividual: false, tipoColuna: 'Tamanho', mensagemObs: '' 
                    };
                }

                if (!itensAgrupados[nomeCategoria]) itensAgrupados[nomeCategoria] = [];
                itensAgrupados[nomeCategoria].push(item);
            });

            renderizarCardapio(itensAgrupados);
        } catch (error) { console.error(error); }
    }

    // ALTERADO (2026-10): o resumo do pedido é sempre "Nome | Tamanho", montado na hora
    // (sem a descrição), e não depende mais do campo descricaoResumo gravado no produto.
    function textoPuroCliente(valor) {
        const d = document.createElement('div');
        d.innerHTML = String(valor || '');
        return (d.textContent || '').replace(/\s+/g, ' ').trim();
    }
    function resumoProdutoCliente(item) {
        const nome = textoPuroCliente(item?.nome) || 'Item';
        const tam = String(item?.tamanho || '').trim();
        return tam ? `${nome} | ${tam}` : nome;
    }
    function escaparAtributoCliente(v) {
        return String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function normalizarChaveProduto(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    
    window.produtoPopupImagens = [];
    window.produtoPopupImagemAtual = 0;

    function getProdutoImagensCliente(item) {
        const imgs = [];
        if (Array.isArray(item?.imagensUrls)) item.imagensUrls.forEach(url => { if (url && !imgs.includes(url)) imgs.push(url); });
        if (item?.imagemUrl && !imgs.includes(item.imagemUrl)) imgs.push(item.imagemUrl);
        return imgs;
    }

    window.renderProdutoImagemPopup = function() {
        const imgs = window.produtoPopupImagens || [];
        const idx = window.produtoPopupImagemAtual || 0;
        const carousel = document.getElementById('item-imagem-carousel');
        const img = document.getElementById('item-imagem-display');
        const counter = document.getElementById('item-imagem-counter');
        const prev = document.querySelector('.item-carousel-prev');
        const next = document.querySelector('.item-carousel-next');

        if (!carousel || !img) return;

        if (!imgs.length) {
            carousel.style.display = 'none';
            img.src = '';
            return;
        }

        carousel.style.display = 'block';
        img.src = imgs[idx] || imgs[0];
        img.classList.add('imagem-ampliavel');
        img.onclick = () => window.abrirZoomImagem(img.src);
        img.classList.add('imagem-ampliavel');
        img.onclick = () => window.abrirZoomImagem(img.src);
        if (counter) { counter.textContent = imgs.length > 1 ? `${idx + 1}/${imgs.length}` : ''; counter.style.display = imgs.length > 1 ? 'block' : 'none'; }
        if (prev) prev.style.display = imgs.length > 1 ? 'flex' : 'none';
        if (next) next.style.display = imgs.length > 1 ? 'flex' : 'none';
    };

    window.mudarImagemProdutoPopup = function(delta) {
        const imgs = window.produtoPopupImagens || [];
        if (!imgs.length) return;
        window.produtoPopupImagemAtual = (window.produtoPopupImagemAtual + delta + imgs.length) % imgs.length;
        window.renderProdutoImagemPopup();
    };


    function getProdutoCompartilhadoKey(item) {
        const nome = normalizarChaveProduto(item?.nome || item?.descricaoResumo || '');
        const tamanho = normalizarChaveProduto(item?.tamanho || '');
        const preco = Number(item?.preco || 0).toFixed(2);
        return encodeURIComponent(`${nome}||${tamanho}||${preco}`);
    }

    function renderizarCardapio(itensAgrupados) {
        const navHorizontal = document.getElementById('categorias-horizontal');
        const mainContent = document.getElementById('menu-principal');
        if(!navHorizontal || !mainContent) return;
        navHorizontal.innerHTML = ''; mainContent.innerHTML = ''; 
        let primeiraCategoria = true;

        const sortedEntries = Object.entries(itensAgrupados).sort((a, b) => a[0].localeCompare(b[0]));

        function gerarEstruturaTabela(idTabela, nomeCat, tipoColuna) {
            let thSecundaria = '';
            if (tipoColuna && tipoColuna !== 'Nenhuma') {
                const lblMobile = tipoColuna === 'Mínimo' ? 'MÍN.' : 'TAM.';
                const lblDesktop = tipoColuna === 'Mínimo' ? 'Mínimo' : 'Tamanho';
                thSecundaria = `<th class="col-sec"><span class="th-mobile">${lblMobile}</span><span class="th-desktop">${lblDesktop}</span></th>`;
            }
            return `<div class="table-card" style="margin-bottom: 20px;">
                <table id="${idTabela}">
                    <caption>${nomeCat}</caption>
                    <thead><tr>
                        <th class="col-item">ITEM</th>
                        <th class="col-icon"></th>
                        ${thSecundaria}
                        <th class="col-unid"><span class="th-mobile">UNID.</span><span class="th-desktop">Unidade</span></th>
                        <th class="col-qtd"><span class="th-mobile">QTD</span><span class="th-desktop">Quantidade</span></th>
                    </tr></thead>
                    <tbody></tbody>
                </table>
            </div>`;
        }

        for (const [nomeCategoria, itens] of sortedEntries) {
            const config = configCategorias[nomeCategoria];
            navHorizontal.innerHTML += `<a href="#${config.idGrupo}" class="categoria-btn ${primeiraCategoria ? 'active-link' : ''}" data-target="${config.idGrupo}">${nomeCategoria}</a>`;

            // 2026-10-15: a mensagem de retirada não aparece mais na categoria; só no resumo e na data.
            const avisoRetiradaHTML = '';
            const infoBoxHTML = avisoRetiradaHTML + ((config.mensagemObs && config.mensagemObs.trim() !== '') ? `<div class="info-box"><div class="info-box-content">${window.formatText(config.mensagemObs)}</div></div>` : '');
            
            let htmlGrupo = `
                <div class="categoria-group ${primeiraCategoria ? 'active-group' : ''}" id="${config.idGrupo}">
                    <h2 class="categoria-title">${nomeCategoria}</h2>`;

            if (config.tipoColuna === 'Tamanho/Minimo') {
                const itensTam = itens.filter(i => i.tamanho && i.tamanho.trim() !== '');
                const itensMin = itens.filter(i => !i.tamanho || i.tamanho.trim() === '');
                
                if (itensTam.length > 0) {
                    htmlGrupo += gerarEstruturaTabela(config.idTabela + '-tam', nomeCategoria, 'Tamanho');
                }
                if (itensMin.length > 0) {
                    htmlGrupo += gerarEstruturaTabela(config.idTabela + '-min', nomeCategoria, 'Mínimo');
                }
            } else {
                htmlGrupo += gerarEstruturaTabela(config.idTabela, nomeCategoria, config.tipoColuna);
            }

            htmlGrupo += `${infoBoxHTML}<div id="erro-${nomeCategoria.toLowerCase().replace(/\s/g, '-')}" class="erro-categoria"></div></div>`;
            mainContent.innerHTML += htmlGrupo;
            primeiraCategoria = false;
        }

        for (const [nomeCategoria, itens] of sortedEntries) {
            const config = configCategorias[nomeCategoria];
            
            if (config.tipoColuna === 'Tamanho/Minimo') {
                const itensTam = itens.filter(i => i.tamanho && i.tamanho.trim() !== '');
                const itensMin = itens.filter(i => !i.tamanho || i.tamanho.trim() === '');
                
                if (itensTam.length > 0) criarTabelaGrupo(itensTam, config.idTabela + '-tam', nomeCategoria, { ...config, tipoColuna: 'Tamanho' });
                if (itensMin.length > 0) criarTabelaGrupo(itensMin, config.idTabela + '-min', nomeCategoria, { ...config, tipoColuna: 'Mínimo' });
            } else {
                criarTabelaGrupo(itens, config.idTabela, nomeCategoria, config);
            }
        }
        
        configurarEventosMenu(); configurarEventosDrag(); atualizarTotal(); 
    }

    function criarTabelaGrupo(grupo, idTabela, nomeGrupo, configCategoria) {
        const tabelaBase = document.getElementById(idTabela);
        if (!tabelaBase) return;
        const tbodyBase = tabelaBase.querySelector('tbody');

        const groupoOrdenado = [...grupo].sort((a, b) => {
            const nomeA = (a.nome || '').trim().toLocaleLowerCase('pt-BR');
            const nomeB = (b.nome || '').trim().toLocaleLowerCase('pt-BR');
            if (nomeA !== nomeB) return nomeA.localeCompare(nomeB, 'pt-BR');
            
            const descA = (a.descricaoItem || '').trim().toLocaleLowerCase('pt-BR');
            const descB = (b.descricaoItem || '').trim().toLocaleLowerCase('pt-BR');
            if (descA !== descB) return descA.localeCompare(descB, 'pt-BR');

            const tamanhoA = (a.tamanho || '').toLowerCase(); const tamanhoB = (b.tamanho || '').toLowerCase();
            const ordem = { 'p': 1, 'm': 2, 'g': 3 };
            return (ordem[tamanhoA.match(/^[pmg]/)?.[0] || ''] || 99) - (ordem[tamanhoB.match(/^[pmg]/)?.[0] || ''] || 99);
        });

        const agruparPorNome = (configCategoria.tipoColuna === 'Tamanho');
        const contagemNomes = {};
        
        if (agruparPorNome) { 
            groupoOrdenado.forEach(item => { 
                const chave = ((item.nome || 'Sem Nome').trim().toLowerCase() + '|||' + (item.descricaoItem || '').trim().toLowerCase());
                contagemNomes[chave] = (contagemNomes[chave] || 0) + 1; 
            }); 
        }

        let chaveAtual = null;
        for (let i = 0; i < groupoOrdenado.length; i++) {
            const item = groupoOrdenado[i]; const tr = document.createElement("tr"); tr.id = item.id; const itemId = item.id; const itemKey = getProdutoCompartilhadoKey(item); 
            const itemNameClean = (item.nome || 'Sem Nome').trim();
            const chaveAgrupamento = (itemNameClean.toLowerCase() + '|||' + (item.descricaoItem || '').trim().toLowerCase());

            const precoFormatado = Number(item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const isIndividualMinCheck = (configCategoria.minIndividual && item.min > 1);
            let erroHtml = isIndividualMinCheck ? `<div class="erro-item-unico">Mín ${item.min} Unid.</div>` : '';

            const inputHtml = `
                <div class="quantidade-input-group">
                    <button type="button" class="qtd-btn-table" onclick="window.alterarQuantidadeTabela('${itemKey}', -1, ${item.min || 1})">-</button>
                    <input type="number" value="0" min="0" data-min="${item.min || 1}" data-preco="${item.preco}" data-resumo="${escaparAtributoCliente(resumoProdutoCliente(item))}" data-grupo="${nomeGrupo}" data-item-id="${itemId}" data-produto-key="${itemKey}" class="quantidade-input">
                    <button type="button" class="qtd-btn-table" onclick="window.alterarQuantidadeTabela('${itemKey}', 1, ${item.min || 1})">+</button>
                </div>`;

            const imagensProdutoItem = getProdutoImagensCliente(item);
            const temFoto = imagensProdutoItem.length > 0;
            // 2026-10-15: a descrição do produto é a descrição da imagem. Não aparece
            // embaixo do nome: abre na janela da foto, ou pelo ícone (i) quando não há foto.
            const textoDescricaoItem = String(item.descricaoItem || item.descricaoPopup || '').trim();
            const temDescPopup = textoDescricaoItem !== '';
            const isClickable = temFoto || temDescPopup;

            let iconeHint = '';
            if (temFoto) {
                iconeHint = `<i class="fas fa-camera foto-hint" title="Ver foto"></i>`;
            } else if (temDescPopup) {
                iconeHint = `<i class="fas fa-info-circle foto-hint" title="Mais informações"></i>`;
            }

            const cssClickable = isClickable ? 'item-nome-clickable tem-foto' : '';
            const inlineClickable = isClickable ? `data-item-id="${itemId}" style="cursor: pointer;"` : ``;

            const celulaNomeHTML = `
                <div class="item-nome-texto" style="line-height: 1.2;">${window.formatText(itemNameClean)}</div>
            `;
            
            let tdSecundaria = '';
            if (configCategoria.tipoColuna && configCategoria.tipoColuna !== 'Nenhuma') {
                let exibicaoColuna2 = configCategoria.tipoColuna === 'Mínimo' ? (item.min || 1) : (item.tamanho || '-');
                if (typeof exibicaoColuna2 === 'string' && exibicaoColuna2.includes(' (')) {
                    exibicaoColuna2 = exibicaoColuna2.replace(' (', ' <span class="peso-mobile">(') + '</span>';
                }
                tdSecundaria = `<td class="col-sec">${exibicaoColuna2}</td>`;
            }

            const celulasRestantesHTML = `${tdSecundaria}<td class="col-unid"><span class="moeda">R$</span> <span class="valor">${precoFormatado}</span></td><td class="col-qtd"><div class="quantidade-container">${inputHtml}${erroHtml}</div></td>`;

            if (agruparPorNome) {
                if (chaveAgrupamento !== chaveAtual) {
                    chaveAtual = chaveAgrupamento; const rows = contagemNomes[chaveAgrupamento];
                    tr.innerHTML = `
                        <td rowspan="${rows}" class="item-group-cell col-item ${cssClickable}" ${inlineClickable}>
                            ${celulaNomeHTML}
                        </td>
                        <td rowspan="${rows}" class="item-group-cell col-icon ${cssClickable}" ${inlineClickable}>
                            ${iconeHint}
                        </td>
                        ${celulasRestantesHTML}
                    `;
                } else { 
                    tr.innerHTML = `<td style="display:none;"></td><td style="display:none;"></td>${celulasRestantesHTML}`; 
                }
                
                const nextChave = i < groupoOrdenado.length - 1 ? ((groupoOrdenado[i+1].nome || 'Sem Nome').trim().toLowerCase() + '|||' + (groupoOrdenado[i+1].descricaoItem || '').trim().toLowerCase()) : null;
                if (i === groupoOrdenado.length - 1 || nextChave !== chaveAtual) { tr.classList.add('group-separator'); }
            } else {
                tr.innerHTML = `
                    <td class="col-item ${cssClickable}" ${inlineClickable}>
                        ${celulaNomeHTML}
                    </td>
                    <td class="col-icon ${cssClickable}" ${inlineClickable}>
                        ${iconeHint}
                    </td>
                    ${celulasRestantesHTML}
                `; 
                tr.classList.add('group-separator');
            }
            tbodyBase.appendChild(tr);
        }

        tbodyBase.querySelectorAll('.quantidade-input').forEach(input => {
            input.addEventListener("input", function() {
                let q = parseInt(this.value);
                if (isNaN(q) || q < 0) q = 0;

                const produtoKey = this.getAttribute('data-produto-key') || this.getAttribute('data-item-id');
                sincronizarQuantidadeVisual(produtoKey, q, this);

                atualizarTotal();
                if (cupomAplicado.codigo) window.aplicarCupom();
            });
            input.addEventListener("blur", function() {
                const q = parseInt(this.value) || 0;
                const quantidadeFinal = (this.value === "" || q <= 0) ? 0 : q;
                const produtoKey = this.getAttribute('data-produto-key') || this.getAttribute('data-item-id');
                sincronizarQuantidadeVisual(produtoKey, quantidadeFinal, this);
                atualizarTotal();
            });
        });
    }

    window.abrirImagemPopupDb = function(itemId) {
        const itemInfo = bancoDeProdutos[itemId]; 
        if(!itemInfo) return;

        const imagensProdutoPopup = getProdutoImagensCliente(itemInfo);
        const temFoto = imagensProdutoPopup.length > 0;
        const textoDescricao = String(itemInfo.descricaoItem || itemInfo.descricaoPopup || '').trim();
        const temDescPopup = textoDescricao !== '';
        
        if(!temFoto && !temDescPopup) return;

        const modal = document.getElementById('popup-item-imagem');
        document.getElementById('item-nome-display').textContent = itemInfo.nome;
        document.getElementById('item-descricao-display').innerHTML = window.formatText(textoDescricao);
        
        window.produtoPopupImagens = imagensProdutoPopup;
        window.produtoPopupImagemAtual = 0;
        window.renderProdutoImagemPopup();
        
        modal.style.display = 'flex'; 
        modal.classList.add('show'); 
        document.body.style.overflow = 'hidden'; 
    }
    
    window.fecharImagemPopup = function() {
        const modal = document.getElementById('popup-item-imagem'); modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 300); 
        document.body.style.overflow = 'auto'; 
    }
    document.addEventListener('click', function(e) { const itemNome = e.target.closest('.item-nome-clickable'); if (itemNome) window.abrirImagemPopupDb(itemNome.getAttribute('data-item-id')); });

    const sideMenu = document.getElementById('side-menu'); const mobileMenuBtn = document.getElementById('mobile-menu-btn'); const closeMenuBtn = document.getElementById('close-menu-btn'); const aboutModal = document.getElementById('aboutModal');
    function toggleMenu(show) { if(sideMenu) show ? sideMenu.classList.add('active') : sideMenu.classList.remove('active'); }
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(true); });
    if (closeMenuBtn) closeMenuBtn.addEventListener('click', () => toggleMenu(false));
    
    window.openAboutModal = function() { if (aboutModal) { aboutModal.classList.add('show'); toggleMenu(false); } }
    window.closeAboutModal = function() { if (aboutModal) aboutModal.classList.remove('show'); }
    if (document.getElementById('menu-quem-somos')) document.getElementById('menu-quem-somos').addEventListener('click', (e) => { e.preventDefault(); window.openAboutModal(); });

    function configurarEventosDrag() {
        const categoriesNav = document.getElementById('categorias-horizontal'); if(!categoriesNav) return;
        // 2026-10-15: quando todas cabem, ficam centralizadas e sem corte; senão, rolam.
        const ajustarAbasCabem = () => {
            categoriesNav.classList.remove('abas-cabem');
            categoriesNav.classList.toggle('abas-cabem', categoriesNav.scrollWidth <= categoriesNav.clientWidth + 1);
        };
        ajustarAbasCabem();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarAbasCabem);
        if (!window.__abasResizeOk) { window.__abasResizeOk = true; window.addEventListener('resize', ajustarAbasCabem); }
        let isDown = false; let startX, scrollLeft;
        
        categoriesNav.addEventListener('mousedown', (e) => { isDown = true; startX = e.pageX - categoriesNav.offsetLeft; scrollLeft = categoriesNav.scrollLeft; });
        categoriesNav.addEventListener('mouseleave', () => isDown = false); categoriesNav.addEventListener('mouseup', () => isDown = false);
        categoriesNav.addEventListener('mousemove', (e) => { if (!isDown) return; e.preventDefault(); const x = e.pageX - categoriesNav.offsetLeft; const walk = (x - startX) * 2; categoriesNav.scrollLeft = scrollLeft - walk; });
    }
    function configurarEventosMenu() {
        const links = document.querySelectorAll('#categorias-horizontal a');
        links.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault(); links.forEach(l => l.classList.remove('active-link'));
                document.querySelectorAll('.categoria-group').forEach(group => group.classList.remove('active-group'));
                this.classList.add('active-link'); const targetId = this.getAttribute('data-target');
                document.getElementById(targetId).classList.add('active-group');
                setTimeout(() => { const container = document.getElementById('categorias-horizontal'); const scrollAmount = this.offsetLeft - container.offsetLeft - 50; container.scrollTo({ left: Math.max(0, scrollAmount), behavior: 'smooth' }); }, 100);
            });
        });
    }

    window.fecharResumoPopup = function() { const p = document.getElementById("popup-resumo"); if(p) { p.classList.remove('show'); setTimeout(() => { p.style.display = "none"; document.body.style.overflow = 'auto'; }, 300); } }
    window.fecharPopup = function() { const p = document.getElementById("popup-pedido"); if(p) { p.classList.remove('show'); setTimeout(() => { p.style.display = "none"; document.body.style.overflow = 'auto'; }, 300); } }
    
    window.abrirResumoPopup = function() {
        if (window.totalPedidoAtivo > 0) { 
            const p = document.getElementById("popup-resumo");
            p.style.display = "flex"; 
            setTimeout(() => p.classList.add('show'), 10);
            document.body.style.overflow = 'hidden'; 
        } else { alert("Seu pedido está vazio!"); }
    }
    
    const btnCarrinho = document.getElementById("fixed-summary");
    if(btnCarrinho) { btnCarrinho.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); window.abrirResumoPopup(); }); }
    
    // =====================================================================
    // DATAS PERMITIDAS PARA RETIRADA POR CATEGORIA (2026-10)
    // Se o pedido tem itens de uma categoria com período de retirada (ex.: Natal,
    // 22/12 a 26/12), o calendário só aceita datas dentro desse período.
    // Com várias categorias restritas, vale o período em comum entre elas.
    // =====================================================================
    function formatarDataCurtaRetirada(iso) {
        const [a, m, d] = String(iso || '').split('-');
        return a && m && d ? `${d}/${m}` : '';
    }
    function formatarDataLongaRetirada(iso) {
        const [a, m, d] = String(iso || '').split('-');
        return a && m && d ? `${d}/${m}/${a}` : '';
    }

    function descreverPeriodoRetirada(ini, fim) {
        const i = formatarDataLongaRetirada(ini), f = formatarDataLongaRetirada(fim);
        if (i && f) return i === f ? `no dia ${i}` : `no período de ${i} - ${f}`;
        if (i) return `a partir de ${i}`;
        if (f) return `até ${f}`;
        return '';
    }

    // Mensagem exibida ao cliente. Se a categoria tiver uma mensagem própria (campo
    // "Mensagem exibida no site" no painel), usa ela. Senão, monta a mensagem padrão.
    function mensagemRetiradaCategoria(nomeCat, cfg) {
        if (!cfg || !(cfg.entregaInicioData || cfg.entregaFimData)) return '';
        if (cfg.entregaMensagem && String(cfg.entregaMensagem).trim()) return String(cfg.entregaMensagem).trim();
        return `Pedidos contendo os itens da categoria ${nomeCat} só são permitidos para retirada ${descreverPeriodoRetirada(cfg.entregaInicioData, cfg.entregaFimData)}.`;
    }

    function mensagemJanelaRetirada(janela) {
        if (!janela || !janela.restrita) return '';
        if (janela.categorias.length === 1) {
            const c = janela.categorias[0];
            return mensagemRetiradaCategoria(c.nome, c.cfg);
        }
        return `Pedidos contendo os itens das categorias ${janela.nomes} só são permitidos para retirada ${descreverPeriodoRetirada(janela.inicio, janela.fim)}.`;
    }

    function getHojeISOLocal() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function normalizarNomeCategoria(v) {
        return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    }
    function getConfigCategoria(nome) {
        if (configCategorias[nome]) return configCategorias[nome];
        const chave = normalizarNomeCategoria(nome);
        const achada = Object.keys(configCategorias).find(k => normalizarNomeCategoria(k) === chave);
        return achada ? configCategorias[achada] : null;
    }

    function calcularJanelaRetiradaCarrinho() {
        const categorias = new Map();
        const processados = new Set();
        document.querySelectorAll(".quantidade-input").forEach(input => {
            const chave = input.getAttribute("data-produto-key") || input.getAttribute("data-item-id");
            if (processados.has(chave)) return;
            processados.add(chave);
            if ((parseInt(input.value) || 0) <= 0) return;
            const produto = bancoDeProdutos[input.getAttribute("data-item-id")] || {};
            const nomes = [produto.categoria, input.getAttribute("data-grupo")].filter(Boolean);
            for (const nomeCat of nomes) {
                const cfg = getConfigCategoria(nomeCat);
                if (cfg && (cfg.entregaInicioData || cfg.entregaFimData)) {
                    categorias.set(nomeCat, { nome: nomeCat, ini: cfg.entregaInicioData || '', fim: cfg.entregaFimData || '', cfg });
                    break;
                }
            }
        });

        const lista = [...categorias.values()];
        let inicio = '', fim = '';
        lista.forEach(c => {
            if (c.ini && (!inicio || c.ini > inicio)) inicio = c.ini;
            if (c.fim && (!fim || c.fim < fim)) fim = c.fim;
        });
        const nomes = lista.map(c => c.nome).join(', ');
        return { restrita: lista.length > 0, inicio, fim, categorias: lista, nomes, conflito: !!(inicio && fim && inicio > fim) };
    }
    window.calcularJanelaRetiradaCarrinho = calcularJanelaRetiradaCarrinho;

    function validarDataNaJanelaRetirada(dataISO, janela) {
        if (!janela || !janela.restrita || !dataISO) return null;
        if ((janela.inicio && dataISO < janela.inicio) || (janela.fim && dataISO > janela.fim)) {
            return `⛔ ${mensagemJanelaRetirada(janela)}`;
        }
        return null;
    }

    function verificarJanelaAntesDoPedido(janela) {
        if (!janela.restrita) return true;
        if (janela.conflito) {
            const detalhes = janela.categorias.map(c => `• ${c.nome}: ${descreverPeriodoRetirada(c.ini, c.fim)}`).join('\n');
            alert(`Os itens do seu pedido têm períodos de retirada diferentes e não dá para retirar tudo na mesma data:\n\n${detalhes}\n\nPor favor, faça pedidos separados.`);
            return false;
        }
        if (janela.fim && janela.fim < getHojeISOLocal()) {
            alert(`O período de retirada dos itens de ${janela.nomes} já terminou. Remova esses itens para continuar.`);
            return false;
        }
        return true;
    }

    // Aviso dentro do resumo do pedido, assim que entra um item com período de retirada.
    function atualizarAvisoJanelaResumo() {
        const lista = document.getElementById("popup-resumo-itens");
        if (!lista) return;
        let aviso = document.getElementById("aviso-janela-resumo");
        if (!aviso) {
            aviso = document.createElement("div");
            aviso.id = "aviso-janela-resumo";
            aviso.className = "aviso-janela-retirada";
            lista.insertAdjacentElement('beforebegin', aviso);
        }
        // 2026-10-15: a mensagem aparece só abaixo do campo de data, não no resumo.
        aviso.innerHTML = '';
        aviso.style.display = 'none';
    }
    window.atualizarAvisoJanelaResumo = atualizarAvisoJanelaResumo;

    window.abrirPopup = function() { 
        const janelaRetirada = calcularJanelaRetiradaCarrinho();
        if (!verificarJanelaAntesDoPedido(janelaRetirada)) return;
        window.fecharResumoPopup(); 
        const p = document.getElementById("popup-pedido"); 
        if(p) { 
            p.style.display = "flex"; 
            setTimeout(() => p.classList.add('show'), 10); 
            document.body.style.overflow = 'hidden'; 

            const inputData = document.getElementById("data");
            const inputHorario = document.getElementById("horario");
            const containerHorario = document.getElementById("horario-entrega-container") || inputHorario.parentNode;

            // Bloqueia dias do passado nativamente no calendário e, se houver itens
            // com período de retirada, limita o calendário a esse período.
            const hoje = getHojeISOLocal();
            const minData = janelaRetirada.inicio && janelaRetirada.inicio > hoje ? janelaRetirada.inicio : hoje;
            inputData.setAttribute('min', minData);
            if (janelaRetirada.fim) inputData.setAttribute('max', janelaRetirada.fim);
            else inputData.removeAttribute('max');

            let avisoJanela = document.getElementById("aviso-janela-retirada");
            if (!avisoJanela) {
                avisoJanela = document.createElement("div");
                avisoJanela.id = "aviso-janela-retirada";
                avisoJanela.className = "aviso-janela-retirada";
                inputData.insertAdjacentElement('afterend', avisoJanela);
            }
            if (janelaRetirada.restrita) {
                // 2026-10-15: só o texto, logo abaixo do campo de data (sem ícone).
                avisoJanela.innerHTML = window.formatText(mensagemJanelaRetirada(janelaRetirada));
                avisoJanela.style.display = 'block';
            } else {
                avisoJanela.style.display = 'none';
            }

            // Limpa os campos sempre que abrir o popup novo
            inputData.value = '';
            inputHorario.value = '';
            inputHorario.style.display = 'block';
            inputHorario.disabled = true;
            containerHorario.style.display = 'none';

            const avisoFechadoInicial = document.getElementById("aviso-data-fechada");
            if (avisoFechadoInicial) avisoFechadoInicial.style.display = 'none';
            
            let selectHorario = document.getElementById("horario-select");
            if (selectHorario) {
                selectHorario.value = '';
                selectHorario.style.display = 'none';
                selectHorario.disabled = true;
            }

            inputData.onchange = function() {
                const dataEscolhida = this.value; 

                let selectHorario = document.getElementById("horario-select");
                if (!selectHorario) {
                    selectHorario = document.createElement("select");
                    selectHorario.id = "horario-select";
                    selectHorario.className = inputHorario.className; 
                    selectHorario.style.padding = "12px";
                    selectHorario.style.borderRadius = "8px";
                    selectHorario.style.border = "1px solid rgba(224, 159, 65, 0.3)";
                    selectHorario.style.width = "100%";
                    selectHorario.style.fontFamily = "var(--font-numbers)";
                    selectHorario.style.display = "none";
                    containerHorario.appendChild(selectHorario);
                }

                inputHorario.value = '';
                inputHorario.disabled = true;
                selectHorario.value = '';
                selectHorario.disabled = true;
                selectHorario.style.display = 'none';

                const avisoFechado = document.getElementById("aviso-data-fechada");

                if (!dataEscolhida) {
                    containerHorario.style.display = 'none';
                    if (avisoFechado) avisoFechado.style.display = 'none';
                    return;
                }

                const partesData = dataEscolhida.split('-');
                const diaDaSemana = new Date(partesData[0], partesData[1] - 1, partesData[2]).getDay();

                const regraExcecao = window.regraExcecaoAplicavel(dataEscolhida);
                const regraGeralDoDia = window.configGeralAgenda ? window.configGeralAgenda[diaDaSemana] : null;

                const resetarDataInvalida = (mensagem) => {
                    this.value = '';
                    inputHorario.value = '';
                    inputHorario.disabled = true;
                    inputHorario.style.display = 'block';
                    selectHorario.value = '';
                    selectHorario.disabled = true;
                    selectHorario.style.display = 'none';
    
                    // Oculta a caixa inteira do Horário (incluindo o título "Horário de Entrega")
                    containerHorario.style.display = 'none'; 
    
                    // Mostra o alerta visual na tela
                    if(avisoFechado) {
                        avisoFechado.innerHTML = `<i class="fa-solid fa-ban"></i> ${mensagem}`;
                        avisoFechado.style.display = 'block';
                    }
                };

                // Esconde a caixa de aviso e REEXIBE a caixa de horário somente após a data ser escolhida e validada
                if(avisoFechado) avisoFechado.style.display = 'none';
                containerHorario.style.display = 'block';

                // 0. DATA FORA DO PERÍODO DE RETIRADA DOS ITENS (ex.: cardápio de Natal)
                const msgJanelaRetirada = validarDataNaJanelaRetirada(dataEscolhida, calcularJanelaRetiradaCarrinho());
                if (msgJanelaRetirada) {
                    // 2026-10-15: a mensagem do período já está logo abaixo da data. Não repete:
                    // só limpa a data e destaca a mensagem por um instante.
                    resetarDataInvalida('');
                    if (avisoFechado) avisoFechado.style.display = 'none';
                    const avisoPeriodo = document.getElementById('aviso-janela-retirada');
                    if (avisoPeriodo) {
                        avisoPeriodo.classList.remove('alerta');
                        void avisoPeriodo.offsetWidth;
                        avisoPeriodo.classList.add('alerta');
                    }
                    return;
                }

                // 1. DATA FECHADA MANUALMENTE (Puxa a mensagem customizada que você digitou)
                if (regraExcecao && regraExcecao.indisponivel) {
                    const msg = regraExcecao.mensagem && regraExcecao.mensagem.trim() !== '' 
                                ? regraExcecao.mensagem 
                                : "⛔ FECHADO (Data Indisponível)";
                    return resetarDataInvalida(msg);
                }

                // 2. DIA DA SEMANA FECHADO NA REGRA GERAL
                if (!regraGeralDoDia || regraGeralDoDia.ativo === false) {
                    if (!regraExcecao || !regraExcecao.horarios || regraExcecao.horarios.trim() === '') {
                        return resetarDataInvalida("⛔ Não operamos neste dia da semana.");
                    }
                }

                // 3. GERA OS HORÁRIOS USANDO O NOVO MOTOR (Aceita intervalos "8h às 20h" ou separações normais)
                let arrayHorariosFinal = [];
                if (regraExcecao && regraExcecao.horarios && regraExcecao.horarios.trim() !== '') {
                    arrayHorariosFinal = window.gerarHorarios(regraExcecao.horarios);
                } else if (regraGeralDoDia && regraGeralDoDia.horarios && regraGeralDoDia.horarios.trim() !== '') {
                    arrayHorariosFinal = window.gerarHorarios(regraGeralDoDia.horarios);
                }

                const tinhaHorariosConfigurados = arrayHorariosFinal.length > 0;
                arrayHorariosFinal = window.filtrarHorariosDisponiveisPorAgora(dataEscolhida, arrayHorariosFinal);

                if (tinhaHorariosConfigurados && arrayHorariosFinal.length === 0) {
                    return resetarDataInvalida("⛔ Não há mais horários disponíveis para esta data.");
                }

                if (arrayHorariosFinal.length > 0) {
                    inputHorario.style.display = 'none'; inputHorario.disabled = true; 
                    selectHorario.style.display = 'block'; selectHorario.disabled = false; 
                    selectHorario.innerHTML = '<option value="" disabled selected>Escolha o horário...</option>';
                    arrayHorariosFinal.forEach(hora => {
                        let textoExibicao = hora.includes(':') ? hora.replace(':', 'h') : hora;
                        selectHorario.innerHTML += `<option value="${hora}">${textoExibicao}</option>`;
                    });
                } else {
                    selectHorario.style.display = 'none'; selectHorario.disabled = true; 
                    inputHorario.style.display = 'block'; inputHorario.disabled = false; 
                }
            };
        } 
    };
    
    window.editarPedido = function() { window.fecharPopup(); setTimeout(() => window.abrirResumoPopup(), 300); }

    window.toggleCreditoCliente = function() {
        // Mantido apenas por compatibilidade com versões antigas. Não há mais campo separado de tipo de crédito.
    };

    function getTaxaPagamentoCliente(forma, modalidade) {
        if (forma === 'Débito') return { percentual: 1.99, label: 'Taxa Débito' };
        if (forma === 'Crédito' || forma === 'Crédito Link') return { percentual: 4.98, label: 'Taxa Crédito' };
        if (forma === 'Crédito Retirada') return { percentual: 3.09, label: 'Taxa Crédito' };
        return { percentual: 0, label: '' };
    }

    function formatarPagamentoCliente(forma, modalidade) {
        return forma || '';
    }



    function getCupomMaxUsosCliente(dadosCupom) {
        return Number(dadosCupom?.quantidadeDisponivel ?? dadosCupom?.maxUsos ?? 0) || 0;
    }

    function getCupomUsosAtuaisCliente(dadosCupom) {
        return Number(dadosCupom?.usosAtuais ?? dadosCupom?.usos ?? 0) || 0;
    }

    function getStatusOperacionalCupomCliente(dadosCupom) {
        const status = String(dadosCupom?.statusCupom || '').trim().toLowerCase();
        if (status === 'inativo' || status === 'pausado' || dadosCupom?.ativo === false) return 'inativo';
        return 'ativo';
    }

    function isCupomEsgotadoCliente(dadosCupom) {
        const max = getCupomMaxUsosCliente(dadosCupom);
        const usos = getCupomUsosAtuaisCliente(dadosCupom);
        return max > 0 && usos >= max;
    }

    async function registrarUsoCupomCliente(codigo) {
        const cupomCodigo = String(codigo || '').trim().toUpperCase();
        if (!cupomCodigo) return;

        try {
            const refCupom = doc(db, "cupons", cupomCodigo);
            const snapCupom = await getDoc(refCupom);
            if (!snapCupom.exists()) return;

            const dados = snapCupom.data();
            await updateDoc(refCupom, {
                usosAtuais: getCupomUsosAtuaisCliente(dados) + 1,
                updatedAt: Date.now()
            });
        } catch (err) {
            console.warn("Não foi possível registrar uso do cupom:", err);
        }
    }

    let cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
    
    window.aplicarCupom = async function() {
        const cupomInput = document.getElementById("cupom-input").value.trim().toUpperCase();
        const cupomMessage = document.getElementById("cupom-message");
        if (!cupomInput) { cupomAplicado = { codigo: null, desconto: 0, mensagem: '' }; cupomMessage.innerHTML = ''; atualizarTotal(); return; }

        try {
            const docRef = doc(db, "cupons", cupomInput);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const dadosCupom = docSnap.data();
                
                const statusCupomCliente = getStatusOperacionalCupomCliente(dadosCupom);
                if (statusCupomCliente === 'inativo') {
                    cupomMessage.innerHTML = '<span class="cupom-error">Cupom inativo.</span>';
                    cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
                } else if (dadosCupom.dataValidade && new Date() > new Date(dadosCupom.dataValidade)) {
                    cupomMessage.innerHTML = '<span class="cupom-error">Cupom expirado.</span>';
                    cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
                } else if (isCupomEsgotadoCliente(dadosCupom)) {
                    cupomMessage.innerHTML = '<span class="cupom-error">Cupom esgotado.</span>';
                    cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
                } else if (window.totalPedidoAtivo < (dadosCupom.valorMinimo || 0)) {
                    cupomMessage.innerHTML = `<span class="cupom-error">Mínimo de R$ ${dadosCupom.valorMinimo.toFixed(2)} para usar este cupom.</span>`;
                    cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
                } else {
                    let valorDesconto = 0;
                    if (dadosCupom.tipo === 'percentual') {
                        valorDesconto = window.totalPedidoAtivo * (dadosCupom.valor / 100);
                    } else if (dadosCupom.tipo === 'fixo') {
                        valorDesconto = dadosCupom.valor;
                    }

                    if (valorDesconto > window.totalPedidoAtivo) valorDesconto = window.totalPedidoAtivo;

                    cupomAplicado = {
                        codigo: cupomInput,
                        desconto: valorDesconto,
                        mensagem: `Desconto de R$ ${valorDesconto.toFixed(2).replace('.', ',')} aplicado!`
                    };
                    cupomMessage.innerHTML = `<span class="cupom-success">${cupomAplicado.mensagem}</span>`;
                }
            } else {
                cupomMessage.innerHTML = '<span class="cupom-error">Cupom inválido.</span>';
                cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
            }
        } catch (error) {
            cupomMessage.innerHTML = '<span class="cupom-error">Erro ao validar cupom.</span>';
            cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
        }
        
        atualizarTotal();
    }

    function gerarIdPedido() { return `PED-${new Date().toISOString().slice(0,10).replace(/-/g, "")}${new Date().toTimeString().slice(0,8).replace(/:/g, "")}`; }
    function validarEFormatarTelefone(telefone) { const n = telefone.replace(/\D/g, ''); return n.length >= 10 ? '55' + n : '5581' + n; }

    function escaparSeletorCss(value) {
        const texto = String(value || '');
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(texto);
        return texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function getInputsQuantidadeProduto(produtoKey) {
        const key = escaparSeletorCss(produtoKey);
        return Array.from(document.querySelectorAll(`.quantidade-input[data-produto-key="${key}"], .quantidade-input[data-item-id="${key}"]`));
    }

    function getInputQuantidadePrincipal(produtoKey) {
        return getInputsQuantidadeProduto(produtoKey)[0] || null;
    }

    function atualizarErroQuantidadeInput(input, quantidade) {
        if (!input) return;

        const grupo = input.getAttribute('data-grupo') || "";
        const min = parseInt(input.getAttribute('data-min')) || 1;
        const erroElemento = input.closest('.quantidade-container')?.querySelector('.erro-item-unico');
        const configGrupo = configCategorias[grupo] || { minIndividual: false };

        if (configGrupo.minIndividual && quantidade > 0 && quantidade < min) {
            if (erroElemento) {
                erroElemento.textContent = `Mín ${min} Unid.`;
                erroElemento.style.display = 'block';
            }
        } else if (erroElemento) {
            erroElemento.style.display = 'none';
        }
    }

    function sincronizarQuantidadeVisual(produtoKey, quantidade, inputOrigem = null) {
        const q = Math.max(0, parseInt(quantidade) || 0);
        const inputs = getInputsQuantidadeProduto(produtoKey);

        inputs.forEach(input => {
            input.value = q.toString();
            atualizarErroQuantidadeInput(input, q);
        });

        if (inputOrigem) {
            const grupoOrigem = inputOrigem.getAttribute('data-grupo') || '';
            inputs.forEach(input => {
                if (grupoOrigem) input.dataset.grupoOrigemResumo = grupoOrigem;
            });
        }
    }

    window.excluirItem = function(itemId) {
        const input = getInputQuantidadePrincipal(itemId);
        if (input) {
            sincronizarQuantidadeVisual(itemId, 0, input);
            atualizarTotal();
        }
        if (cupomAplicado.codigo) window.aplicarCupom();
    }

    window.alterarQuantidadeResumo = function(itemId, delta) {
        const key = escaparSeletorCss(itemId);
        const input = document.querySelector(`#popup-resumo-itens input[data-produto-key="${key}"], #popup-resumo-itens input[data-item-id="${key}"]`);
        if (!input) return;
        input.value = Math.max(0, (parseInt(input.value) || 0) + delta);
        window.atualizarQuantidadeDireta(input);
    }

    window.atualizarQuantidadeDireta = function(inputElement) {
        const itemId = inputElement.getAttribute('data-produto-key') || inputElement.getAttribute('data-item-id');
        const inputNoMain = getInputQuantidadePrincipal(itemId);
        if (inputNoMain) { 
            let q = parseInt(String(inputElement.value).replace(/[^0-9]/g, ''));
            if (isNaN(q) || q < 0) q = 0;
            sincronizarQuantidadeVisual(itemId, q, inputNoMain);
            atualizarTotal(); 
            if (cupomAplicado.codigo) window.aplicarCupom(); 
        }
    }

    window.alterarQuantidadeTabela = function(itemId, delta, minimo) {
        const input = getInputQuantidadePrincipal(itemId); if (!input) return;
        let novaQtd = parseInt(input.value) || 0; 

        const min = minimo || parseInt(input.getAttribute('data-min')) || 1;
        if (delta > 0 && novaQtd === 0) novaQtd = min; else novaQtd += delta;
        if (novaQtd < 0) novaQtd = 0;

        sincronizarQuantidadeVisual(itemId, novaQtd, input);
        atualizarTotal();
    };

    function atualizarTotal() {
        let totalBruto = 0; let totalItens = 0;
        const resumoItensPopup = document.getElementById("popup-resumo-itens"); const resumoTotalPopup = document.getElementById("popup-resumo-total");
        const fixedSummary = document.getElementById("fixed-summary"); const btnContainer = document.getElementById("fazer-pedido-button-container");
        if (!resumoItensPopup) return; resumoItensPopup.innerHTML = ''; 
        const gruposResumo = {}; const totaisPorGrupo = {};
        
        let temErroMinimo = false;

        const produtosResumoProcessados = new Set();

        document.querySelectorAll(".quantidade-input").forEach(input => {
            const produtoKey = input.getAttribute("data-produto-key") || input.getAttribute("data-item-id");
            if (produtosResumoProcessados.has(produtoKey)) return;
            produtosResumoProcessados.add(produtoKey);

            const q = parseInt(input.value) || 0;
            let g = input.dataset.grupoOrigemResumo || input.getAttribute("data-grupo") || ""; 

            if (!totaisPorGrupo[g]) totaisPorGrupo[g] = 0; 
            totaisPorGrupo[g] += q;

            if(q > 0) {
                const p = parseFloat(input.getAttribute("data-preco")) || 0;
                const minIndividualItem = parseInt(input.getAttribute("data-min")) || 1;
                const configGrupo = configCategorias[g] || { minIndividual: false };

                totalBruto += (q * p); totalItens += q;
                if (!gruposResumo[g]) gruposResumo[g] = [];
                
                let erroItemResumo = false;
                if (configGrupo.minIndividual && q < minIndividualItem) {
                    temErroMinimo = true;
                    erroItemResumo = true;
                }

                gruposResumo[g].push({ 
                    input, 
                    quantidade: q, 
                    preco: p, 
                    descricaoResumo: input.getAttribute("data-resumo"), 
                    itemId: produtoKey,
                    minimoExigido: minIndividualItem,
                    comErro: erroItemResumo
                });
            }
        });

        let totalLiquido = totalBruto - cupomAplicado.desconto; if(totalLiquido < 0) totalLiquido = 0;
        window.totalPedidoAtivo = totalBruto; 

        for (const grupo in gruposResumo) {
            const config = configCategorias[grupo]; const erroCategoria = document.getElementById('erro-' + grupo.toLowerCase().replace(/\s/g, '-'));
            let categoriaComErroTotal = false;

            if(config && config.minTotal > 0 && totaisPorGrupo[grupo] > 0 && totaisPorGrupo[grupo] < config.minTotal) { 
                temErroMinimo = true; 
                categoriaComErroTotal = true;
                if(erroCategoria) { 
                    erroCategoria.textContent = `Mínimo de ${config.minTotal} unidades nesta categoria.`; 
                    if (config.mensagemObs && config.mensagemObs.trim() !== '') {
                        erroCategoria.style.display = 'none';
                    } else {
                        erroCategoria.style.display = 'block'; 
                    }
                } 
            } else { 
                if(erroCategoria) erroCategoria.style.display = 'none'; 
            }
            
            resumoItensPopup.innerHTML += `<div class="resumo-grupo-titulo">${grupo}:</div>`;
            gruposResumo[grupo].forEach(item => {
                let avisoMinimoHTML = item.comErro ? `<div class="erro-item-unico" style="display:block; text-align:center; margin-top:4px; text-transform: uppercase;">Mín ${item.minimoExigido} Unid.</div>` : '';

                resumoItensPopup.innerHTML += `
                    <div class="resumo-item-line" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed rgba(29, 40, 20, 0.2);">
                        <div class="resumo-item-name" style="flex: 1; text-align: left; padding-right: 10px;">
                            ${window.formatText(item.descricaoResumo)} <small style="display: block; color: var(--text-light); margin-top: 2px;">R$ ${(item.quantidade * item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</small>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div class="resumo-item-input-group" style="display: flex; align-items: center; gap: 5px;">
                                    <button type="button" class="resumo-qtd-btn" onclick="window.alterarQuantidadeResumo('${item.itemId}', -1)">-</button>
                                    <input type="number" value="${item.quantidade}" min="0" data-item-id="${item.itemId}" data-produto-key="${item.itemId}" oninput="window.atualizarQuantidadeDireta(this)" style="width: 38px; height: 30px; text-align: center; border: 1px solid rgba(29, 40, 20, 0.2); border-radius: 6px;">
                                    <button type="button" class="resumo-qtd-btn" onclick="window.alterarQuantidadeResumo('${item.itemId}', 1)">+</button>
                                </div>
                                <button class="btn-excluir" onclick="window.excluirItem('${item.itemId}')" style="background: none; border: none; color: #E60000; cursor: pointer;"><i class="fas fa-trash"></i></button>
                            </div>
                            ${avisoMinimoHTML}
                        </div>
                    </div>`;
            });

            if (categoriaComErroTotal) {
                resumoItensPopup.innerHTML += `
                    <div style="display: flex; justify-content: flex-end; margin-top: 5px; margin-bottom: 10px;">
                        <div class="erro-item-unico" style="width: 140px; text-align: center; display: block; text-transform: uppercase;">
                            Mín ${config.minTotal} Unid.
                        </div>
                    </div>`;
            }
        }

        const produtosMinimoProcessados = new Set();

        document.querySelectorAll(".quantidade-input").forEach(input => {
            const produtoKey = input.getAttribute("data-produto-key") || input.getAttribute("data-item-id");
            if (produtosMinimoProcessados.has(produtoKey)) return;
            produtosMinimoProcessados.add(produtoKey);

            const q = parseInt(input.value) || 0;
            let grp = input.dataset.grupoOrigemResumo || input.getAttribute("data-grupo") || "";

            const config = configCategorias[grp];
            if (q > 0 && config && config.minTotal > 0 && totaisPorGrupo[grp] < config.minTotal) {
                temErroMinimo = true;
                const erroCategoria = document.getElementById('erro-' + grp.toLowerCase().replace(/\s/g, '-'));
                if(erroCategoria) { 
                    erroCategoria.textContent = `Mínimo de ${config.minTotal} unidades nesta categoria.`; 
                    if (config.mensagemObs && config.mensagemObs.trim() !== '') {
                        erroCategoria.style.display = 'none';
                    } else {
                        erroCategoria.style.display = 'block'; 
                    }
                }
            }
        });

        try { atualizarAvisoJanelaResumo(); } catch (e) {}

        if (totalBruto === 0) {
            resumoTotalPopup.style.display = 'none'; btnContainer.innerHTML = ''; fixedSummary.style.display = 'none'; window.fecharResumoPopup();
        } else {
            resumoTotalPopup.style.display = ''; fixedSummary.style.display = 'flex';
            document.getElementById("summary-total").textContent = `R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            document.getElementById("summary-item-count").textContent = ` / ${totalItens} itens`;
            
            resumoTotalPopup.innerHTML = `TOTAL: R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            
            if(temErroMinimo) { btnContainer.innerHTML = '<p style="color:red; text-align:center; font-size:1.1rem; font-family: \'Basic Choice\', cursive;">Ajuste as quantidades mínimas.</p>'; } else { btnContainer.innerHTML = `<button type="button" onclick="window.abrirPopup()" class="btn-fazer-pedido">${escSite(window.__textosCardapio.botaoFazerPedido)}</button>`; }
        }
    }

    window.confirmarPedido = async function() {
        // Prévia do tema (painel): nada é gravado nem enviado.
        if (new URLSearchParams(location.search).has('tema_previa')) { alert('Esta é uma prévia do tema: pedidos estão desativados aqui.'); return; }
        const btn = document.querySelector('.btn-primary-large');
        const txtOriginal = btn.textContent;
        btn.textContent = "Processando...";
        btn.disabled = true;

        const form = document.getElementById("form-pedido");
        if (form && !form.checkValidity()) {
            form.reportValidity(); 
            btn.textContent = txtOriginal; 
            btn.disabled = false;
            return;
        }

        const idPedido = gerarIdPedido(); 
        let txt = `${String(window.__textosCardapio.saudacaoWhatsapp).replace(/\\n/g, '\n')}\n\n*ID: ${idPedido}*\n\n- *Resumo:*\n\n`;
        const moedaWA = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let total = 0; 
        const gResumo = {}; 
        let temItens = false; 
        let itensParaPlanilha = ""; 
        // CORREÇÃO HISTÓRICO (2026-10): lista com os itens "congelados" no momento do pedido
        // (id do produto, nome, categoria, quantidade e preço). Assim, se o produto for
        // renomeado ou mudar de preço depois, o pedido continua exatamente como foi feito.
        const itensCongelados = [];
        let blocoSeguroTravado = false;

        const produtosPedidoProcessados = new Set();

        document.querySelectorAll(".quantidade-input").forEach(i => {
            const produtoKey = i.getAttribute("data-produto-key") || i.getAttribute("data-item-id");
            if (produtosPedidoProcessados.has(produtoKey)) return;
            produtosPedidoProcessados.add(produtoKey);

            const q = parseInt(i.value) || 0;
            if (q > 0) { 
                let grp = i.dataset.grupoOrigemResumo || i.getAttribute("data-grupo") || ""; 

                const minIndividualItem = parseInt(i.getAttribute("data-min")) || 1;
                const configGrupo = configCategorias[grp] || { minIndividual: false };

                if (configGrupo.minIndividual && q < minIndividualItem) {
                    blocoSeguroTravado = true;
                    return; 
                }

                temItens = true; 
                const p = parseFloat(i.getAttribute("data-preco"))||0; 
                const desc = i.getAttribute("data-resumo");
                
                total += (q * p); 
                if(!gResumo[grp]) gResumo[grp] = []; 
                gResumo[grp].push({ q, p, desc }); 

                const produtoIdItem = i.getAttribute("data-item-id") || '';
                const produtoBanco = bancoDeProdutos[produtoIdItem] || {};
                const precoUnit = Math.round(p * 100) / 100;
                itensCongelados.push({
                    produtoId: produtoIdItem,
                    nome: String(desc || produtoBanco.nome || '').trim(),
                    categoria: produtoBanco.categoria || grp || 'Geral',
                    tamanho: produtoBanco.tamanho || '',
                    qtd: q,
                    precoUnitario: precoUnit,
                    total: Math.round(q * precoUnit * 100) / 100
                });
            }
        });
        
        if (!temItens || blocoSeguroTravado) { 
            alert("Pedido inválido ou com quantidades abaixo do mínimo permitido."); 
            btn.textContent = txtOriginal; btn.disabled = false; 
            return; 
        }

        // ALTERADO (2026-10): igual ao orçamento do painel, cada item mostra o valor
        // unitário e o total ("Item | P - 1 un. (R$ 100,00 cada) = R$ 100,00").
        for (const grp in gResumo) {
            txt += `*${grp}:*\n`;
            gResumo[grp].forEach(item => {
                txt += `${item.desc} - ${item.q} un. (R$ ${moedaWA(item.p)} cada) = R$ ${moedaWA(item.q * item.p)}\n`;
            });
            txt += `\n`;
        }
        
        const nm = document.getElementById("nome").value;
        const tel = document.getElementById("telefone").value;
        const dt = document.getElementById("data").value;
        const hrInput = document.getElementById("horario");
        const selectHorario = document.getElementById("horario-select");
        const hr = (selectHorario && !selectHorario.disabled && selectHorario.style.display !== 'none') ? selectHorario.value : hrInput.value;
        const pag = document.getElementById("pagamento").value;
        const modalidadeCredito = '';
        const formaPagamentoFirestore = pag === 'Crédito' ? 'Crédito Link' : pag;
        const obs = document.getElementById("observacoes").value;

        if (!nm || !tel || !dt || !hr || !pag) { 
            alert("Preencha todos os campos obrigatórios!"); 
            btn.textContent = txtOriginal; btn.disabled = false; 
            return; 
        }

        const janelaFinal = calcularJanelaRetiradaCarrinho();
        const msgJanelaFinal = janelaFinal.conflito ? 'Os itens do pedido têm períodos de retirada diferentes. Faça pedidos separados.' : validarDataNaJanelaRetirada(dt, janelaFinal);
        if (msgJanelaFinal) {
            alert(textoPuroCliente(String(msgJanelaFinal).replace('⛔ ', '').replace(/<br\s*\/?>|<\/(div|p)>/gi, '\n')));
            btn.textContent = txtOriginal; btn.disabled = false;
            return;
        }

        if (window.regraExcecaoAplicavel(dt)?.indisponivel) {
            alert("A data selecionada está indisponível para entregas. Por favor, escolha outro dia.");
            btn.textContent = txtOriginal; 
            btn.disabled = false; 
            return;
        }
        
        // CORREÇÃO HISTÓRICO: o resumo gravado agora leva categoria e preço de cada item,
        // no mesmo formato do painel ("- Categoria:" / "2 un. - Item (R$ 10,00) = R$ 20,00").
        // Antes ia só "2 un. - Item", e o painel adivinhava preço/categoria pelo cadastro ATUAL.
        const formatarMoedaResumo = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');
        const gruposPlanilha = {};
        itensCongelados.forEach(it => {
            if (!gruposPlanilha[it.categoria]) gruposPlanilha[it.categoria] = [];
            gruposPlanilha[it.categoria].push(`${it.qtd} un. - ${it.nome} (R$ ${formatarMoedaResumo(it.precoUnitario)}) = R$ ${formatarMoedaResumo(it.total)}`);
        });
        Object.keys(gruposPlanilha).forEach(cat => {
            itensParaPlanilha += `- ${cat}:\n${gruposPlanilha[cat].join('\n')}\n\n`;
        });

        let totalLiquido = total - cupomAplicado.desconto;
        if(totalLiquido < 0) totalLiquido = 0;

        const dataFormatada = dt.split("-").reverse().join("/");
        const taxaPagamento = getTaxaPagamentoCliente(formaPagamentoFirestore, modalidadeCredito);
        const valorTaxaPagamento = totalLiquido * ((taxaPagamento.percentual || 0) / 100);
        const valorRecebidoPagamento = Math.max(0, totalLiquido - valorTaxaPagamento);

        txt += `Valor dos Itens: R$ ${moedaWA(total)}\n`;
        if(cupomAplicado.codigo) { txt += `Cupom: ${cupomAplicado.codigo}\n`; txt += `Desconto: -R$ ${moedaWA(cupomAplicado.desconto)}\n`; }
        txt += `*Total Final: R$ ${moedaWA(totalLiquido)}*\n\n`;
        txt += `- *Informações:*\nNome: ${nm}\nNúmero: ${validarEFormatarTelefone(tel)}\nData: ${dataFormatada}\nHorário: ${hr.substring(0,5)}\nPagamento: ${formatarPagamentoCliente(pag, modalidadeCredito)}\n`;
        if(obs) txt += `Observações: ${obs}\n`;

        const dadosPedido = {
            ID_do_Pedido: idPedido,
            origem: 'site', 
            Status_do_Pedido: 'Pedido Recebido',
            Nome_Cliente: nm,
            Numero: validarEFormatarTelefone(tel),
            Data_Entrega: dataFormatada,
            Horario_Entrega: hr.substring(0,5),
            Total_Final: totalLiquido.toLocaleString('pt-BR',{minimumFractionDigits:2}),
            Forma_de_Pagamento: formaPagamentoFirestore,
            Modalidade_Credito: modalidadeCredito,
            Taxa_Pagamento: taxaPagamento.label || '',
            Percentual_Taxa_Pagamento: taxaPagamento.percentual || 0,
            Valor_Taxa_Pagamento: valorTaxaPagamento > 0 ? valorTaxaPagamento.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '',
            Valor_Recebido: valorTaxaPagamento > 0 ? valorRecebidoPagamento.toLocaleString('pt-BR',{minimumFractionDigits:2}) : '',
            Status_Pagamento: 'Pagamento pendente', 
            Cupom: cupomAplicado.codigo ? `Cupom: ${cupomAplicado.codigo}\nDesconto: -R$${cupomAplicado.desconto.toFixed(2).replace('.', ',')}` : "",
            Observacoes: obs || "",
            Resumo_dos_Itens: itensParaPlanilha.trim(),
            Itens: itensCongelados,
            Subtotal_Itens: total.toLocaleString('pt-BR',{minimumFractionDigits:2}),
            createdAt: Date.now()
        };
        
        try {
            await setDoc(doc(db, "pedidos", idPedido), dadosPedido);
            if (cupomAplicado.codigo) await registrarUsoCupomCliente(cupomAplicado.codigo);
        } catch (error) {
            console.error("Erro ao salvar pedido no Firestore:", error);
            alert("Erro de conexão ao salvar pedido.");
            btn.textContent = txtOriginal; 
            btn.disabled = false;
            return;
        }

        window.location.href = `https://wa.me/558195256641?text=${encodeURIComponent(txt)}`;
        
        document.querySelectorAll(".quantidade-input").forEach(i => i.value = "0"); 
        atualizarTotal(); 
        window.fecharPopup(); 
        window.fecharResumoPopup(); 
        window.scrollTo(0,0);

        btn.textContent = txtOriginal; 
        btn.disabled = false;
    }
    
    // Inicia o cardápio!
    carregarMenu();
});