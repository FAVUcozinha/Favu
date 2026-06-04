import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// =========================================================
// PLANILHA GOOGLE SCRIPT URL
// =========================================================
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbxg41fkz_lDRKUTcnukG-LmuasWR_W6C7QovJo7Vdll58snz9MknU9f5QZ2KWKOOSA/exec";

async function enviarPedidoParaPlanilha(dadosPedido) {
    try {
        const params = new URLSearchParams();
        const action = dadosPedido.action || 'create';
        params.append('action', action);
        
        if (action === 'replacePedido' && dadosPedido.oldId) {
            params.append('oldId', dadosPedido.oldId);
        }
        
        for (const key in dadosPedido) {
            if (key !== 'action' && key !== 'oldId') {
                params.append(key, dadosPedido[key] || '');
            }
        }
        
        await fetch(GOOGLE_SHEETS_URL, {
            method: "POST",
            mode: 'no-cors', 
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString()
        });
        
        return true; 
    } catch (err) { 
        console.error("Erro planilha:", err); 
        alert("Erro de conexão ao salvar pedido na planilha.");
        return false;
    }
}

// ==========================================
// FORMATADOR DE TEXTO (QUEBRAS DE LINHA E MARKDOWN)
// ==========================================
window.formatText = function(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
};

document.addEventListener("DOMContentLoaded", async function () {
    
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

    async function carregarAvisos() {
        try {
            const avisosSnap = await getDocs(collection(db, "avisos"));
            const agora = Date.now(); 
            
            avisosSnap.forEach(doc => {
                const a = doc.data();
                if (a.ativo && agora >= a.inicio && agora <= a.fim) {
                    const popup = document.getElementById('popup-aviso');
                    if(popup) {
                        document.getElementById('aviso-titulo').textContent = a.titulo;
                        document.getElementById('aviso-texto').innerHTML = window.formatText(a.texto);
                        
                        if(a.imagemUrl) {
                             document.getElementById('aviso-texto').innerHTML += `<img src="${a.imagemUrl}" style="max-width:100%; margin-top:15px; border-radius:10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">`;
                        }
                        popup.style.display = 'flex';
                        setTimeout(() => popup.classList.add('show'), 50);
                    }
                }
            });
        } catch (e) {}
    }
    carregarAvisos();

    window.onclick = function(e) {
        if (e.target.classList.contains('modal') || e.target.classList.contains('popup')) {
            if (e.target.id === 'popup-pedido' || e.target.id === 'popup-resumo') {
                return;
            }
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
            catSnapshot.forEach(doc => {
                const c = doc.data();
                configCategorias[c.nome] = { 
                    idGrupo: `grupo-${c.nome.toLowerCase().replace(/\s/g, '-')}`, 
                    idTabela: `tabela-${c.nome.toLowerCase().replace(/\s/g, '-')}`, 
                    minTotal: c.minTotal || 0, minIndividual: c.minIndividual || false,
                    tipoColuna: c.tipoColuna || 'Tamanho', mensagemObs: c.mensagemObs || ''
                };
            });

            const q = query(collection(db, "produtos"), where("ativo", "==", true));
            const querySnapshot = await getDocs(q);
            const itensAgrupados = {};

            querySnapshot.forEach((doc) => {
                const item = { idFirebase: doc.id, ...doc.data() };
                item.id = (item.nome.toLowerCase() + (item.tamanho ? '-' + item.tamanho.toLowerCase() : '')).replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').trim('-');
                bancoDeProdutos[item.id] = item; 

                if (!configCategorias[item.categoria]) {
                    configCategorias[item.categoria] = { 
                        idGrupo: `grupo-${item.categoria.toLowerCase().replace(/\s/g, '-')}`, 
                        idTabela: `tabela-${item.categoria.toLowerCase().replace(/\s/g, '-')}`, 
                        minTotal: 0, minIndividual: false, tipoColuna: 'Tamanho', mensagemObs: '' 
                    };
                }

                if (!itensAgrupados[item.categoria]) itensAgrupados[item.categoria] = [];
                itensAgrupados[item.categoria].push(item);
            });

            renderizarCardapio(itensAgrupados);
        } catch (error) { console.error(error); }
    }

    function renderizarCardapio(itensAgrupados) {
        const navHorizontal = document.getElementById('categorias-horizontal');
        const mainContent = document.getElementById('menu-principal');
        if(!navHorizontal || !mainContent) return;
        navHorizontal.innerHTML = ''; mainContent.innerHTML = ''; 
        let primeiraCategoria = true;

        const sortedEntries = Object.entries(itensAgrupados).sort((a, b) => a[0].localeCompare(b[0]));

        for (const [nomeCategoria, itens] of sortedEntries) {
            const config = configCategorias[nomeCategoria];
            navHorizontal.innerHTML += `<a href="#${config.idGrupo}" class="categoria-btn ${primeiraCategoria ? 'active-link' : ''}" data-target="${config.idGrupo}">${nomeCategoria}</a>`;

            let thSecundaria = '';
            if (config.tipoColuna && config.tipoColuna !== 'Nenhuma') {
                const lblMobile = config.tipoColuna === 'Mínimo' ? 'MÍN.' : 'TAM.';
                const lblDesktop = config.tipoColuna === 'Mínimo' ? 'Mínimo' : 'Tamanho';
                thSecundaria = `<th class="col-sec"><span class="th-mobile">${lblMobile}</span><span class="th-desktop">${lblDesktop}</span></th>`;
            }

            const cabecalho = `<tr>
                <th class="col-item">ITEM</th>
                <th class="col-icon"></th>
                ${thSecundaria}
                <th class="col-unid"><span class="th-mobile">UNID.</span><span class="th-desktop">Unidade</span></th>
                <th class="col-qtd"><span class="th-mobile">QTD</span><span class="th-desktop">Quantidade</span></th>
            </tr>`;

            const infoBoxHTML = (config.mensagemObs && config.mensagemObs.trim() !== '') ? `<div class="info-box"><p>${window.formatText(config.mensagemObs)}</p></div>` : '';

            mainContent.innerHTML += `
                <div class="categoria-group ${primeiraCategoria ? 'active-group' : ''}" id="${config.idGrupo}">
                    <h2 class="categoria-title">${nomeCategoria}</h2>
                    <div class="table-card">
                        <table id="${config.idTabela}">
                            <caption>${nomeCategoria}</caption>
                            <thead>${cabecalho}</thead>
                            <tbody></tbody>
                        </table>
                        ${infoBoxHTML}
                        <div id="erro-${nomeCategoria.toLowerCase().replace(/\s/g, '-')}" class="erro-categoria"></div>
                    </div>
                </div>
            `;
            primeiraCategoria = false;
        }

        for (const [nomeCategoria, itens] of sortedEntries) {
            criarTabelaGrupo(itens, configCategorias[nomeCategoria].idTabela, nomeCategoria, configCategorias[nomeCategoria]);
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
            const item = groupoOrdenado[i]; const tr = document.createElement("tr"); tr.id = item.id; const itemId = item.id; 
            const itemNameClean = (item.nome || 'Sem Nome').trim();
            const chaveAgrupamento = (itemNameClean.toLowerCase() + '|||' + (item.descricaoItem || '').trim().toLowerCase());

            const precoFormatado = Number(item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const isMiniCookie = itemId.includes('mini-cookie'); 
            const isIndividualMinCheck = (configCategoria.minIndividual && item.min > 1) || isMiniCookie;
            let erroHtml = isIndividualMinCheck ? `<div class="erro-item-unico">Mín ${item.min} Unid.</div>` : '';

            // MODIFICADO: Removido o atributo readonly para permitir escrita manual
            const inputHtml = `
                <div class="quantidade-input-group">
                    <button type="button" class="qtd-btn-table" onclick="window.alterarQuantidadeTabela('${itemId}', -1, ${item.min || 1})">-</button>
                    <input type="number" value="0" min="0" data-min="${item.min || 1}" data-preco="${item.preco}" data-resumo="${item.descricaoResumo || item.nome}" data-grupo="${nomeGrupo}" data-item-id="${itemId}" class="quantidade-input">
                    <button type="button" class="qtd-btn-table" onclick="window.alterarQuantidadeTabela('${itemId}', 1, ${item.min || 1})">+</button>
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

        // MODIFICADO: Atualizado listeners para capturar digitação manual em tempo real de forma segura
        tbodyBase.querySelectorAll('.quantidade-input').forEach(input => {
            input.addEventListener("input", function() {
                let q = parseInt(this.value);
                if (isNaN(q) || q < 0) q = 0;
                
                const grupo = this.getAttribute('data-grupo');
                const min = parseInt(this.getAttribute('data-min')) || 1;
                const erroElemento = this.closest('.quantidade-container')?.querySelector('.erro-item-unico');
                const configGrupo = configCategorias[grupo] || {minIndividual: false};
                
                if (configGrupo.minIndividual && q > 0 && q < min) {
                    if (erroElemento) { erroElemento.textContent = `Mín ${min} Unid.`; erroElemento.style.display = 'block'; }
                } else {
                    if (erroElemento) erroElemento.style.display = 'none';
                }
                
                atualizarTotal();
                if (cupomAplicado.codigo) window.aplicarCupom();
            });
            input.addEventListener("blur", function() {
                const q = parseInt(this.value) || 0; 
                this.value = (this.value === "" || q <= 0) ? "0" : q.toString(); 
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
    
    // AJUSTADO: Controle dinâmico de selects para a campanha de Namorados
    window.abrirPopup = function() { 
        window.fecharResumoPopup(); 
        const p = document.getElementById("popup-pedido"); 
        if(p) { 
            p.style.display = "flex"; 
            setTimeout(() => p.classList.add('show'), 10); 
            document.body.style.overflow = 'hidden'; 

            const dateInput = document.getElementById("data");
            const timeInput = document.getElementById("horario");
            const timeGroup = timeInput.closest('.input-group');
            
            let temNamorados = false;
            document.querySelectorAll(".quantidade-input").forEach(i => {
                if ((parseInt(i.value) || 0) > 0 && i.getAttribute("data-grupo") === "❤️ Namorados ❤️") {
                    temNamorados = true;
                }
            });

            // Estrutura de horários configurada por data
            const horariosCampanha = {
                "2026-06-12": ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"],
                "2026-06-13": ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"]
            };

            if (temNamorados) {
                // 1º PASSO: Transformar o campo de data em um SELECT com as opções válidas
                const selectData = document.createElement("select");
                selectData.id = "data";
                selectData.name = "data";
                selectData.required = true;
                selectData.innerHTML = `
                    <option value="" disabled selected>Selecione a data de entrega...</option>
                    <option value="2026-06-12">12/06/2026</option>
                    <option value="2026-06-13">13/06/2026</option>
                `;
                dateInput.parentNode.replaceChild(selectData, dateInput);

                // 2º PASSO: Transformar o campo de horário em um SELECT vazio por padrão
                const selectHorario = document.createElement("select");
                selectHorario.id = "horario";
                selectHorario.name = "horario";
                selectHorario.required = true;
                timeInput.parentNode.replaceChild(selectHorario, timeInput);

                // Oculta o container de horário até que a data seja escolhida
                if (timeGroup) timeGroup.style.display = "none";

                // Listener para popular os horários de meia em meia hora baseados na data
                selectData.onchange = function() {
                    const dataSelecionada = this.value;
                    selectHorario.innerHTML = '<option value="" disabled selected>Selecione o horário...</option>';
                    
                    if (horariosCampanha[dataSelecionada]) {
                        horariosCampanha[dataSelecionada].forEach(hora => {
                            selectHorario.innerHTML += `<option value="${hora}">${hora.replace(':', 'h')}</option>`;
                        });
                        if (timeGroup) timeGroup.style.display = "flex";
                    } else {
                        if (timeGroup) timeGroup.style.display = "none";
                    }
                };
            } else {
                // Caso NÃO tenha namorados, garante que os campos voltem a ser Inputs normais
                if (dateInput.tagName === "SELECT") {
                    const inputData = document.createElement("input");
                    inputData.type = "date";
                    inputData.id = "data";
                    inputData.name = "data";
                    inputData.required = true;
                    dateInput.parentNode.replaceChild(inputData, dateInput);
                }
                if (timeInput.tagName === "SELECT") {
                    const inputHorario = document.createElement("input");
                    inputHorario.type = "time";
                    inputHorario.id = "horario";
                    inputHorario.name = "horario";
                    inputHorario.required = true;
                    timeInput.parentNode.replaceChild(inputHorario, timeInput);
                }

                // readquire referências atualizadas dos inputs recriados
                const finalDateInput = document.getElementById("data");
                const finalTimeInput = document.getElementById("horario");
                const finalTimeGroup = finalTimeInput.closest('.input-group');

                finalDateInput.removeAttribute("min");
                finalDateInput.removeAttribute("max");
                if (finalTimeGroup) finalTimeGroup.style.display = "flex";
                finalDateInput.onchange = null;
            }
        } 
    };
    
    window.editarPedido = function() { window.fecharPopup(); setTimeout(() => window.abrirResumoPopup(), 300); }

    let cupomAplicado = { codigo: null, desconto: 0, mensagem: '' };
    const CUPONS_GERADOS = { 'FAVU10': { descontoTipo: 'percentual', valor: 0.10, aplicaEm: 'total', expiraEm: '2026-12-31', usoUnico: false, usado: false } };

    function gerarIdPedido() { return `PED-${new Date().toISOString().slice(0,10).replace(/-/g, "")}${new Date().toTimeString().slice(0,8).replace(/:/g, "")}`; }
    function validarEFormatarTelefone(telefone) { const n = telefone.replace(/\D/g, ''); return n.length >= 10 ? '55' + n : '5581' + n; }

    window.excluirItem = function(itemId) {
        const input = document.querySelector(`.quantidade-input[data-item-id="${itemId}"]`);
        if (input) { input.value = "0"; input.dispatchEvent(new Event('input')); }
        if (cupomAplicado.codigo) window.aplicarCupom();
    }

    window.alterarQuantidadeResumo = function(itemId, delta) {
        const input = document.querySelector(`#popup-resumo-itens input[data-item-id="${itemId}"]`); if (!input) return;
        input.value = Math.max(0, (parseInt(input.value) || 0) + delta); window.atualizarQuantidadeDireta(input);
    }
    
    window.atualizarQuantidadeDireta = function(inputElement) {
        const itemId = inputElement.getAttribute('data-item-id'); const inputNoMain = document.querySelector(`.quantidade-input[data-item-id="${itemId}"]`);
        if (inputNoMain) { 
            let q = parseInt(inputElement.value.replace(/[^0-9]/g, ''));
            if (isNaN(q) || q < 0) q = 0;
            inputNoMain.value = q; 
            atualizarTotal(); 
            if (cupomAplicado.codigo) window.aplicarCupom(); 
        }
    }

    window.alterarQuantidadeTabela = function(itemId, delta, minimo) {
        const input = document.querySelector(`.quantidade-input[data-item-id="${itemId}"]`); if (!input) return;
        let novaQtd = parseInt(input.value) || 0; const grupo = input.getAttribute('data-grupo'); const min = minimo || parseInt(input.getAttribute('data-min')) || 1;
        const erroElemento = input.closest('.quantidade-container')?.querySelector('.erro-item-unico');
        if (delta > 0 && novaQtd === 0) novaQtd = min; else novaQtd += delta;
        if (novaQtd < 0) novaQtd = 0; input.value = novaQtd;
        const configGrupo = configCategorias[grupo] || {minIndividual: false};
        if (configGrupo.minIndividual && novaQtd > 0 && novaQtd < min) { if (erroElemento) { erroElemento.textContent = `Mín ${min} Unid.`; erroElemento.style.display = 'block'; } } else { if (erroElemento) erroElemento.style.display = 'none'; }
        atualizarTotal();
    };

    window.openAgendarPopup = function() { window.fecharResumoPopup(); const p = document.getElementById("popup-pedido"); if(p) { p.style.display = "flex"; setTimeout(() => p.classList.add('show'), 10); document.body.style.overflow = 'hidden'; } }

    function atualizarTotal() {
        let totalBruto = 0; let totalItens = 0;
        const resumoItensPopup = document.getElementById("popup-resumo-itens"); const resumoTotalPopup = document.getElementById("popup-resumo-total");
        const fixedSummary = document.getElementById("fixed-summary"); const btnContainer = document.getElementById("fazer-pedido-button-container");
        if (!resumoItensPopup) return; resumoItensPopup.innerHTML = ''; 
        const gruposResumo = {}; const totaisPorGrupo = {};
        
        let temErroMinimo = false;

        document.querySelectorAll(".quantidade-input").forEach(input => {
            const q = parseInt(input.value) || 0;
            const g = input.getAttribute("data-grupo"); 
            if (!totaisPorGrupo[g]) totaisPorGrupo[g] = 0; 
            totaisPorGrupo[g] += q;

            if(q > 0) {
                const grp = input.getAttribute("data-grupo"); const p = parseFloat(input.getAttribute("data-preco")) || 0;
                const minIndividualItem = parseInt(input.getAttribute("data-min")) || 1;
                const configGrupo = configCategorias[grp] || { minIndividual: false };

                totalBruto += (q * p); totalItens += q;
                if (!gruposResumo[grp]) gruposResumo[grp] = [];
                
                let erroItemResumo = false;
                if (configGrupo.minIndividual && q < minIndividualItem) {
                    temErroMinimo = true;
                    erroItemResumo = true;
                }

                gruposResumo[grp].push({ 
                    input, 
                    quantidade: q, 
                    preco: p, 
                    descricaoResumo: input.getAttribute("data-resumo"), 
                    itemId: input.getAttribute("data-item-id"),
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

                // MODIFICADO: Removido o atributo readonly do input de quantidade no resumo também
                resumoItensPopup.innerHTML += `
                    <div class="resumo-item-line" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed rgba(29, 40, 20, 0.2);">
                        <div class="resumo-item-name" style="flex: 1; text-align: left; padding-right: 10px;">
                            ${window.formatText(item.descricaoResumo)} <small style="display: block; color: var(--text-light); margin-top: 2px;">R$ ${(item.quantidade * item.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</small>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div class="resumo-item-input-group" style="display: flex; align-items: center; gap: 5px;">
                                    <button type="button" class="resumo-qtd-btn" onclick="window.alterarQuantidadeResumo('${item.itemId}', -1)">-</button>
                                    <input type="number" value="${item.quantidade}" min="0" data-item-id="${item.itemId}" oninput="window.atualizarQuantidadeDireta(this)" style="width: 38px; height: 30px; text-align: center; border: 1px solid rgba(29, 40, 20, 0.2); border-radius: 6px;">
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

        document.querySelectorAll(".quantidade-input").forEach(input => {
            const q = parseInt(input.value) || 0;
            const grp = input.getAttribute("data-grupo");
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
        let temNamorados = false;

        document.querySelectorAll(".quantidade-input").forEach(i => {
            const q = parseInt(i.value) || 0;
            if (q > 0) { 
                const grp = i.getAttribute("data-grupo"); 
                if (grp === "❤️ Namorados ❤️") {
                    temNamorados = true;
                }
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
                
                itensParaPlanilha += `${q}x ${desc} (${grp})\n`;
            }
        });
        
        if (!temItens || blocoSeguroTravado) { 
            alert("Pedido inválido ou com quantidades abaixo do mínimo permitido."); 
            btn.textContent = txtOriginal; btn.disabled = false; 
            return; 
        }
        
        const nm = document.getElementById("nome").value;
        const tel = document.getElementById("telefone").value;
        const dt = document.getElementById("data").value;
        const hr = document.getElementById("horario").value;
        const pag = document.getElementById("pagamento").value;
        const obs = document.getElementById("observacoes").value;

        if (!nm || !tel || !dt || !hr || !pag) { 
            alert("Preencha todos os campos obrigatórios!"); 
            btn.textContent = txtOriginal; btn.disabled = false; 
            return; 
        }

        // AJUSTADO: Validação secundária à prova de falhas para o horário dos Namorados
        if (temNamorados) {
            if (dt === "2026-06-12" && (hr < "16:00" || hr > "19:00")) {
                alert("Para o dia 12/06, o horário de entrega deve ser entre 16:00 e 19:00.");
                btn.textContent = txtOriginal; btn.disabled = false;
                return;
            }
            if (dt === "2026-06-13" && (hr < "13:00" || hr > "16:00")) {
                alert("Para o dia 13/06, o horário de entrega deve ser entre 13:00 e 16:00.");
                btn.textContent = txtOriginal; btn.disabled = false;
                return;
            }
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
            Nome_Cliente: nm,
            Numero: validarEFormatarTelefone(tel),
            Data_Entrega: dataFormatada,
            Horario_Entrega: hr.substring(0,5),
            Resumo_dos_Itens: itensParaPlanilha.trim(),
            Total_Final: `R$ ${totalLiquido.toLocaleString('pt-BR',{minimumFractionDigits:2})}`,
            Forma_de_Pagamento: pag,
            Cupom: cupomAplicado.codigo || "",
            Observacoes: obs || "",
            Status_Pagamento: "Pendente",
            Status_do_Pedido: "Pedido Recebido"
        };
        
        const sucesso = await enviarPedidoParaPlanilha(dadosPedido);

        if (!sucesso) {
            btn.textContent = txtOriginal; 
            btn.disabled = false;
            return; 
        }

        window.open(`https://wa.me/558195256641?text=${encodeURIComponent(txt)}`, '_blank');
        
        document.querySelectorAll(".quantidade-input").forEach(i => i.value = "0"); 
        atualizarTotal(); 
        window.fecharPopup(); 
        window.fecharResumoPopup(); 
        window.scrollTo(0,0);

        btn.textContent = txtOriginal; 
        btn.disabled = false;
    }
    carregarMenu();
});
