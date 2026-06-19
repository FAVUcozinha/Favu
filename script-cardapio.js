import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc, query, where, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
window.totalPedidoAtivo = 0; 
window.regrasAgenda = {}; // Agenda Global

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

document.addEventListener("DOMContentLoaded", async function () {
    
    // Tema Cores
    try {
        const temaDoc = await getDoc(doc(db, "config", "tema"));
        if (temaDoc.exists()) {
            const t = temaDoc.data();
            const root = document.documentElement;
            if(t.bg) root.style.setProperty('--bg-color', t.bg);
            if(t.card) root.style.setProperty('--card-bg', t.card);
            if(t.txt) root.style.setProperty('--text-dark', t.txt);
            if(t.acc) { root.style.setProperty('--accent-orange', t.acc); root.style.setProperty('--accent-rust', t.acc); }
        }
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

    function renderAvisoPopupContent(aviso) {
        const texto = window.formatText(aviso?.texto || '');
        const posicaoImagem = (aviso?.posicaoImagem || 'top').toLowerCase() === 'bottom' ? 'bottom' : 'top';
        const imagemHtml = aviso?.imagemUrl
            ? `<div class="aviso-popup-image aviso-popup-image-${posicaoImagem}"><img src="${aviso.imagemUrl}" alt="Imagem do comunicado"></div>`
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
                
                if (estaVisivel && c.agendarVisibilidade && c.inicio && c.fim) {
                    const agora = Date.now();
                    if (agora < c.inicio || agora > c.fim) {
                        estaVisivel = false;
                    }
                }

                if (estaVisivel) { 
                    categoriasAtivas.push(c.nome);
                    configCategorias[c.nome] = { 
                        idGrupo: `grupo-${c.nome.toLowerCase().replace(/\s/g, '-')}`, 
                        idTabela: `tabela-${c.nome.toLowerCase().replace(/\s/g, '-')}`, 
                        minTotal: c.minTotal || 0, minIndividual: c.minIndividual || false,
                        tipoColuna: c.tipoColuna || 'Tamanho', mensagemObs: c.mensagemObs || ''
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

    function normalizarChaveProduto(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

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

            const infoBoxHTML = (config.mensagemObs && config.mensagemObs.trim() !== '') ? `<div class="info-box"><div class="info-box-content">${window.formatText(config.mensagemObs)}</div></div>` : '';
            
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
                    <input type="number" value="0" min="0" data-min="${item.min || 1}" data-preco="${item.preco}" data-resumo="${item.descricaoResumo || item.nome}" data-grupo="${nomeGrupo}" data-item-id="${itemId}" data-produto-key="${itemKey}" class="quantidade-input">
                    <button type="button" class="qtd-btn-table" onclick="window.alterarQuantidadeTabela('${itemKey}', 1, ${item.min || 1})">+</button>
                </div>`;

            const temFoto = item.imagemUrl && item.imagemUrl.trim() !== "";
            const temDescPopup = item.descricaoPopup && item.descricaoPopup.trim() !== "";
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
                ${item.descricaoItem ? `<div class="descricao" style="text-align: left;">${window.formatText(item.descricaoItem)}</div>` : ''}
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

        const temFoto = itemInfo.imagemUrl && itemInfo.imagemUrl.trim() !== "";
        const temDescPopup = itemInfo.descricaoPopup && itemInfo.descricaoPopup.trim() !== "";
        
        if(!temFoto && !temDescPopup) return;

        const modal = document.getElementById('popup-item-imagem');
        document.getElementById('item-nome-display').textContent = itemInfo.nome;
        document.getElementById('item-descricao-display').innerHTML = window.formatText(itemInfo.descricaoPopup || itemInfo.descricaoItem || '');
        
        const img = document.getElementById('item-imagem-display');
        if(temFoto) { 
            img.src = itemInfo.imagemUrl; 
            img.style.display = 'block'; 
        } else { 
            img.src = '';
            img.style.display = 'none'; 
        }
        
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
    
    window.abrirPopup = function() { 
        window.fecharResumoPopup(); 
        const p = document.getElementById("popup-pedido"); 
        if(p) { 
            p.style.display = "flex"; 
            setTimeout(() => p.classList.add('show'), 10); 
            document.body.style.overflow = 'hidden'; 

            const inputData = document.getElementById("data");
            const inputHorario = document.getElementById("horario");
            const containerHorario = document.getElementById("horario-entrega-container") || inputHorario.parentNode;

            // Bloqueia dias do passado nativamente no calendário
            const hoje = new Date().toISOString().split('T')[0];
            inputData.setAttribute('min', hoje);

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

                const regraExcecao = window.regrasAgenda ? window.regrasAgenda[dataEscolhida] : null;
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
                
                if (dadosCupom.ativo === false) {
                    cupomMessage.innerHTML = '<span class="cupom-error">Cupom inativo.</span>';
                    cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
                } else if (dadosCupom.dataValidade && new Date() > new Date(dadosCupom.dataValidade)) {
                    cupomMessage.innerHTML = '<span class="cupom-error">Cupom expirado.</span>';
                    cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
                } else if (dadosCupom.quantidadeDisponivel !== undefined && dadosCupom.quantidadeDisponivel <= 0) {
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

        if (totalBruto === 0) {
            resumoTotalPopup.style.display = 'none'; btnContainer.innerHTML = ''; fixedSummary.style.display = 'none'; window.fecharResumoPopup();
        } else {
            resumoTotalPopup.style.display = ''; fixedSummary.style.display = 'flex';
            document.getElementById("summary-total").textContent = `R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            document.getElementById("summary-item-count").textContent = ` / ${totalItens} itens`;
            
            resumoTotalPopup.innerHTML = `TOTAL: R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            
            if(temErroMinimo) { btnContainer.innerHTML = '<p style="color:red; text-align:center; font-size:1.1rem; font-family: \'Basic Choice\', cursive;">Ajuste as quantidades mínimas.</p>'; } else { btnContainer.innerHTML = '<button type="button" onclick="window.abrirPopup()" class="btn-fazer-pedido">FAZER PEDIDO</button>'; }
        }
    }

    window.confirmarPedido = async function() {
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
        let txt = `Olá, Favu!\nGostaria de encomendar os itens abaixo:\n\n*ID: ${idPedido}*\n\n- *Resumo:*\n\n`;
        let total = 0; 
        const gResumo = {}; 
        let temItens = false; 
        let itensParaPlanilha = ""; 
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
                
                itensParaPlanilha += `${q} un. - ${desc}\n`;
            }
        });
        
        if (!temItens || blocoSeguroTravado) { 
            alert("Pedido inválido ou com quantidades abaixo do mínimo permitido."); 
            btn.textContent = txtOriginal; btn.disabled = false; 
            return; 
        }

        for (const grp in gResumo) {
            txt += `*${grp}*\n`;
            gResumo[grp].forEach(item => {
                txt += `• ${item.q}x ${item.desc}\n`;
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
        const obs = document.getElementById("observacoes").value;

        if (!nm || !tel || !dt || !hr || !pag) { 
            alert("Preencha todos os campos obrigatórios!"); 
            btn.textContent = txtOriginal; btn.disabled = false; 
            return; 
        }

        if (window.regrasAgenda && window.regrasAgenda[dt] && window.regrasAgenda[dt].indisponivel) {
            alert("A data selecionada está indisponível para entregas. Por favor, escolha outro dia.");
            btn.textContent = txtOriginal; 
            btn.disabled = false; 
            return;
        }
        
        let totalLiquido = total - cupomAplicado.desconto;
        if(totalLiquido < 0) totalLiquido = 0;

        const dataFormatada = dt.split("-").reverse().join("/");

        txt += `- *Informações:*\nNome: ${nm}\nNúmero: ${validarEFormatarTelefone(tel)}\nData: ${dataFormatada}\nHorário: ${hr.substring(0,5)}\nPagamento: ${pag}\n`;
        if(obs) txt += `Observações: ${obs}\n`;
        if(cupomAplicado.codigo) txt += `Cupom: ${cupomAplicado.codigo} (-R$ ${cupomAplicado.desconto.toFixed(2)})\n`;
        txt += `*Total Final: R$ ${totalLiquido.toLocaleString('pt-BR',{minimumFractionDigits:2})}*\n`;

        const dadosPedido = {
            ID_do_Pedido: idPedido,
            origem: 'site', 
            Status_do_Pedido: 'Pedido Recebido',
            Nome_Cliente: nm,
            Numero: validarEFormatarTelefone(tel),
            Data_Entrega: dataFormatada,
            Horario_Entrega: hr.substring(0,5),
            Total_Final: totalLiquido.toLocaleString('pt-BR',{minimumFractionDigits:2}),
            Forma_de_Pagamento: pag,
            Status_Pagamento: 'Pagamento pendente', 
            Cupom: cupomAplicado.codigo ? `${cupomAplicado.codigo} (-R$ ${cupomAplicado.desconto.toFixed(2).replace('.', ',')})` : "",
            Observacoes: obs || "",
            Resumo_dos_Itens: itensParaPlanilha.trim(),
            createdAt: Date.now()
        };
        
        try {
            await setDoc(doc(db, "pedidos", idPedido), dadosPedido);
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