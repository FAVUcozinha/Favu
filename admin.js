import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const IMGBB_KEY = "25f8ca3ee7fbf1f1a8c0a669d54b9db8";

const app = initializeApp({
    apiKey: "AIzaSyD5JlV7R2w629uiescD4AiixNAr-Qt0qI0",
    authDomain: "favu-app.firebaseapp.com",
    projectId: "favu-app",
    storageBucket: "favu-app.firebasestorage.app",
    messagingSenderId: "793414871188",
    appId: "1:793414871188:web:07ab447df44d742e022c81"
});
const db = getFirestore(app);

let globalCategories = [];
let allProducts = [];
let currentCategoryFilter = '';

async function upImg(file) {
    try {
        const fd = new FormData(); fd.append("image", file);
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
        const d = await res.json();
        return d.success ? d.data.url : "";
    } catch(e) {
        alert("Erro no upload da imagem (Verifique o AdBlocker)."); return "";
    }
}

// ==========================================
// 1. SINCRONIZAR CATEGORIAS
// ==========================================
async function syncCats() {
    const snap = await getDocs(collection(db, "categorias"));
    globalCategories = [];
    const tb = document.querySelector('#tbl-categorias tbody'); tb.innerHTML = "";
    let opts = `<option value="">Selecione...</option>`;
    
    snap.forEach(d => { const c = d.data(); c.id = d.id; globalCategories.push(c); });
    
    globalCategories.sort((a,b) => a.nome.localeCompare(b.nome));

    globalCategories.forEach(c => {
        opts += `<option value="${c.nome}">${c.nome}</option>`;
        const isAtivo = c.ativo !== false; 
        
        tb.innerHTML += `<tr>
            <td><strong style="color:#E09F41;">${c.nome}</strong></td>
            <td>${c.minTotal}</td>
            <td>${c.tipoColuna}</td>
            <td><small>${c.mensagemObs || '-'}</small></td>
            <td><strong style="color:${isAtivo ? '#28a745' : '#E60000'};">${isAtivo ? 'Ativa' : 'Oculta'}</strong></td>
            <td style="white-space: nowrap;">
                <button class="btn-action edit" onclick="window.openEditCat('${c.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                <button class="btn-action toggle" onclick="window.togC('${c.id}', ${!isAtivo})" title="Ocultar/Exibir"><i class="fas fa-${isAtivo?'eye-slash':'eye'}"></i></button>
                <button class="btn-action del" onclick="window.delC('${c.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    document.querySelectorAll('.cat-select').forEach(sel => { const v = sel.value; sel.innerHTML = opts; sel.value = v; });
}

document.getElementById('form-add-cat').onsubmit = async(e) => {
    e.preventDefault(); const nm = document.getElementById('ac-nome').value.trim();
    await setDoc(doc(db, "categorias", nm.toLowerCase().replace(/\s/g, '-')), { 
        nome: nm, minTotal: parseInt(document.getElementById('ac-min').value)||0, 
        tipoColuna: document.getElementById('ac-col').value, mensagemObs: document.getElementById('ac-obs').value.trim(), ativo: true, minIndividual: true
    }); alert("Categoria Criada!"); document.getElementById('modal-add-cat').style.display='none'; syncCats(); e.target.reset();
};

window.openEditCat = async(id) => {
    const c = (await getDoc(doc(db, "categorias", id))).data();
    document.getElementById('ec-id').value = id; document.getElementById('ec-nome').value = c.nome;
    document.getElementById('ec-min').value = c.minTotal; document.getElementById('ec-col').value = c.tipoColuna;
    document.getElementById('ec-obs').value = c.mensagemObs || ''; document.getElementById('modal-editar-cat').style.display = 'flex';
};
document.getElementById('form-edit-cat').onsubmit = async(e) => {
    e.preventDefault(); const id = document.getElementById('ec-id').value;
    await updateDoc(doc(db, "categorias", id), { nome: document.getElementById('ec-nome').value.trim(), minTotal: parseInt(document.getElementById('ec-min').value)||0, tipoColuna: document.getElementById('ec-col').value, mensagemObs: document.getElementById('ec-obs').value.trim() });
    alert("Categoria Atualizada!"); document.getElementById('modal-editar-cat').style.display='none'; syncCats(); loadProds();
};
window.togC = async(id, s) => { await updateDoc(doc(db, "categorias", id), {ativo: s}); syncCats(); };
window.delC = async(id) => { if(confirm("Excluir categoria?")) { await deleteDoc(doc(db, "categorias", id)); syncCats(); loadProds(); }};

// ==========================================
// 2. PRODUTOS, ABAS E LOTE
// ==========================================
document.getElementById('form-add-prod').onsubmit = async(e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
    try {
        let url = ""; const f = document.getElementById('a-file').files[0]; if(f) url = await upImg(f);
        await addDoc(collection(db, "produtos"), {
            nome: document.getElementById('a-nome').value.trim(), categoria: document.getElementById('a-cat').value,
            tamanho: document.getElementById('a-tam').value.trim(), preco: parseFloat(document.getElementById('a-preco').value)||0,
            min: parseInt(document.getElementById('a-min').value)||1, descricaoItem: document.getElementById('a-dmenu').value.trim(),
            descricaoResumo: document.getElementById('a-dres').value.trim(), descricaoPopup: document.getElementById('a-dpop').value.trim(), imagemUrl: url, ativo: true
        });
        alert(" AdicionadItemo!"); document.getElementById('modal-add-prod').style.display='none'; e.target.reset(); loadProds();
    } catch(err) { console.error(err); alert("Erro ao salvar."); } finally { btn.innerHTML = 'Salvar Produto'; btn.disabled = false; }
};

window.addGridRow = () => {
    const c = document.getElementById('bulk-rows'); const d = document.createElement('div'); d.className = 'grid-row';
    let opts = `<option value="">Selecione...</option>`; globalCategories.forEach(cat => opts += `<option value="${cat.nome}">${cat.nome}</option>`);
    d.innerHTML = `
        <div><input type="file" class="b-file" accept="image/*"></div>
        <div><select class="b-cat cat-select">${opts}</select></div>
        <div><input type="text" class="b-nome" placeholder="Nome"></div>
        <div><input type="text" class="b-tam" placeholder="Ex: P"></div>
        <div><input type="number" class="b-min" value="1"></div>
        <div><input type="number" step="0.01" class="b-preco" placeholder="0.00"></div>
        <div><textarea class="b-dmenu" rows="2" placeholder="Item"></textarea></div>
        <div><textarea class="b-dres" rows="2" placeholder="WhatsApp"></textarea></div>
        <div><textarea class="b-dpop" rows="2" placeholder="Popup"></textarea></div>
    `; c.appendChild(d);
};

window.saveBulkItems = async() => {
    const btn = document.getElementById('btn-save-bulk'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subindo fotos...'; btn.disabled = true;
    try {
        for(let r of document.querySelectorAll('#bulk-rows .grid-row')) {
            const nm = r.querySelector('.b-nome').value.trim(); if(!nm) continue;
            let url = ""; const f = r.querySelector('.b-file').files[0]; if(f) url = await upImg(f);
            await addDoc(collection(db, "produtos"), {
                nome: nm, categoria: r.querySelector('.b-cat').value, tamanho: r.querySelector('.b-tam').value, min: parseInt(r.querySelector('.b-min').value)||1, preco: parseFloat(r.querySelector('.b-preco').value)||0,
                descricaoItem: r.querySelector('.b-dmenu').value, descricaoResumo: r.querySelector('.b-dres').value, descricaoPopup: r.querySelector('.b-dpop').value, imagemUrl: url, ativo: true
            });
        }
        alert("Lote adicionado!"); document.getElementById('bulk-rows').innerHTML = ''; document.getElementById('bulk-area').classList.add('hidden'); loadProds();
    } catch(err) { console.error(err); alert("Erro."); } finally { btn.innerHTML = 'Salvar'; btn.disabled = false; }
};

// BUSCA E FILTRO
document.getElementById('search-prod').addEventListener('input', () => { window.renderProdsTable(); });

async function loadProds() {
    const s = await getDocs(collection(db, "produtos"));
    allProducts = []; s.forEach(d => allProducts.push({id: d.id, ...d.data()}));
    renderProdTabs();
    window.renderProdsTable();
}

function renderProdTabs() {
    const container = document.getElementById('prod-cats-nav');
    const catsUsed = [...new Set(allProducts.map(p => p.categoria || 'Sem Categoria'))].sort((a,b) => a.localeCompare(b));
    if (!currentCategoryFilter || !catsUsed.includes(currentCategoryFilter)) currentCategoryFilter = catsUsed[0] || '';
    let html = '';
    catsUsed.forEach(c => { html += `<button class="prod-tab-btn ${currentCategoryFilter === c ? 'active' : ''}" onclick="window.filterProds('${c}')">${c}</button>`; });
    container.innerHTML = html;
}

window.filterProds = function(cat) { currentCategoryFilter = cat; renderProdTabs(); window.renderProdsTable(); }

window.renderProdsTable = function() {
    const searchTerm = document.getElementById('search-prod').value.toLowerCase();
    const tb = document.querySelector("#tbl-produtos tbody"); tb.innerHTML = "";
    
    let filtered = allProducts;
    if (searchTerm) {
        // Se estiver pesquisando, ignora a aba da categoria
        filtered = allProducts.filter(p => p.nome.toLowerCase().includes(searchTerm));
    } else {
        filtered = allProducts.filter(p => (p.categoria || 'Sem Categoria') === currentCategoryFilter);
    }

    filtered.sort((a,b)=>a.nome.localeCompare(b.nome)).forEach(p => {
        tb.innerHTML += `<tr>
            <td><img src="${p.imagemUrl}" class="img-preview" onerror="this.style.display='none'"></td>
            <td><strong>${p.nome}</strong></td>
            <td><small>${p.tamanho||'-'}</small></td>
            <td>${p.min||1}</td>
            <td>R$ ${p.preco.toFixed(2)}</td>
            <td><small>${p.descricaoItem||'-'}</small></td>
            <td><small>${p.descricaoResumo||'-'}</small></td>
            <td><small>${p.descricaoPopup||'-'}</small></td>
            <td><strong style="color:${p.ativo?'#28a745':'#E60000'};">${p.ativo?'Visível':'Oculto'}</strong></td>
            <td style="white-space: nowrap;">
                <button class="btn-action edit" onclick="window.openEditor('${p.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                <button class="btn-action toggle" onclick="window.togP('${p.id}', ${!p.ativo})" title="${p.ativo?'Ocultar':'Exibir'}"><i class="fas fa-${p.ativo?'eye-slash':'eye'}"></i></button>
                <button class="btn-action del" onclick="window.delP('${p.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
}

window.openEditor = async(id) => {
    const p = (await getDoc(doc(db,"produtos",id))).data();
    document.getElementById('e-id').value = id; document.getElementById('e-nome').value = p.nome; document.getElementById('e-cat').value = p.categoria; document.getElementById('e-tam').value = p.tamanho||''; document.getElementById('e-preco').value = p.preco; document.getElementById('e-min').value = p.min||1; document.getElementById('e-dmenu').value = p.descricaoItem||''; document.getElementById('e-dres').value = p.descricaoResumo||''; document.getElementById('e-dpop').value = p.descricaoPopup||''; document.getElementById('e-file').value = ''; document.getElementById('modal-editar-prod').style.display = 'flex';
};
document.getElementById('form-edit-prod').onsubmit = async(e) => {
    e.preventDefault(); const id = document.getElementById('e-id').value;
    const btn = e.target.querySelector('button[type="submit"]'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
    try {
        const data = { nome: document.getElementById('e-nome').value, categoria: document.getElementById('e-cat').value, tamanho: document.getElementById('e-tam').value, preco: parseFloat(document.getElementById('e-preco').value)||0, min: parseInt(document.getElementById('e-min').value)||1, descricaoItem: document.getElementById('e-dmenu').value, descricaoResumo: document.getElementById('e-dres').value, descricaoPopup: document.getElementById('e-dpop').value };
        const f = document.getElementById('e-file').files[0]; if(f) data.imagemUrl = await upImg(f);
        await updateDoc(doc(db, "produtos", id), data); alert("Produto Atualizado!"); document.getElementById('modal-editar-prod').style.display='none'; loadProds(); 
    } catch(err) { console.error(err); alert("Erro ao editar."); } finally { btn.innerHTML = 'Salvar Alterações'; btn.disabled = false; }
};
window.togP = async(id, s) => { await updateDoc(doc(db, "produtos", id), {ativo:s}); loadProds(); };
window.delP = async(id) => { if(confirm("Excluir item permanentemente?")) { await deleteDoc(doc(db, "produtos", id)); loadProds(); }};

// ==========================================
// 3. AVISOS & CORES & CARROSSEL
// ==========================================
document.getElementById('form-add-aviso').onsubmit = async(e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...'; btn.disabled = true;
    try {
        let url = ""; const f = document.getElementById('aa-file').files[0]; if(f) url = await upImg(f);
        const ini = new Date(`${document.getElementById('aa-inid').value}T${document.getElementById('aa-inih').value}`).getTime();
        const fim = new Date(`${document.getElementById('aa-fimd').value}T${document.getElementById('aa-fimh').value}`).getTime();
        await addDoc(collection(db, "avisos"), { titulo: document.getElementById('aa-tit').value, texto: document.getElementById('aa-txt').value, inicio: ini, fim: fim, imagemUrl: url, ativo: true });
        alert("Comunicado Agendado!"); document.getElementById('modal-add-aviso').style.display='none'; loadAvisos(); e.target.reset();
    } catch(err) { console.error(err); alert("Erro."); } finally { btn.innerHTML = 'Agendar Aviso'; btn.disabled = false; }
};

async function loadAvisos() {
    const s = await getDocs(collection(db, "avisos")); const tb = document.querySelector("#tbl-avisos tbody"); tb.innerHTML = "";
    s.forEach(d => {
        const a = d.data(); const isAtivo = a.ativo !== false; const agora = Date.now();
        let st = (agora >= a.inicio && agora <= a.fim && isAtivo) ? "No Ar" : (isAtivo ? "Agendado/Vencido" : "Pausado");
        let stColor = isAtivo ? (agora >= a.inicio && agora <= a.fim ? '#28a745' : '#E09F41') : '#E60000';
        const eyeIcon = isAtivo ? 'eye-slash' : 'eye';

        tb.innerHTML += `<tr>
            <td><img src="${a.imagemUrl||''}" class="img-preview" onerror="this.style.display='none'"></td>
            <td><strong>${a.titulo}</strong></td>
            <td><small>${a.texto}</small></td>
            <td>${new Date(a.inicio).toLocaleString()} até ${new Date(a.fim).toLocaleString()}</td>
            <td><strong style="color:${stColor};">${st}</strong></td>
            <td style="white-space: nowrap;">
                <button class="btn-action edit" onclick="window.openEditAviso('${d.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                <button class="btn-action toggle" onclick="window.togA('${d.id}', ${!isAtivo})" title="Ocultar/Exibir"><i class="fas fa-${eyeIcon}"></i></button>
                <button class="btn-action del" onclick="window.delDoc('avisos','${d.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
}

window.openEditAviso = async(id) => {
    const a = (await getDoc(doc(db,"avisos",id))).data();
    document.getElementById('ea-id').value = id; document.getElementById('ea-tit').value = a.titulo; document.getElementById('ea-txt').value = a.texto;
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    const dIni = new Date(a.inicio - tzOffset); document.getElementById('ea-inid').value = dIni.toISOString().split('T')[0]; document.getElementById('ea-inih').value = dIni.toISOString().split('T')[1].slice(0,5);
    const dFim = new Date(a.fim - tzOffset); document.getElementById('ea-fimd').value = dFim.toISOString().split('T')[0]; document.getElementById('ea-fimh').value = dFim.toISOString().split('T')[1].slice(0,5);
    document.getElementById('ea-file').value = ''; document.getElementById('modal-editar-aviso').style.display = 'flex';
};
document.getElementById('form-edit-aviso').onsubmit = async(e) => {
    e.preventDefault(); const id = document.getElementById('ea-id').value; const btn = e.target.querySelector('button[type="submit"]'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
    try {
        let data = { titulo: document.getElementById('ea-tit').value, texto: document.getElementById('ea-txt').value, inicio: new Date(`${document.getElementById('ea-inid').value}T${document.getElementById('ea-inih').value}`).getTime(), fim: new Date(`${document.getElementById('ea-fimd').value}T${document.getElementById('ea-fimh').value}`).getTime() };
        const f = document.getElementById('ea-file').files[0]; if(f) data.imagemUrl = await upImg(f);
        await updateDoc(doc(db, "avisos", id), data); alert("Aviso atualizado!"); document.getElementById('modal-editar-aviso').style.display = 'none'; loadAvisos();
    } catch(e) { console.error(e); } finally { btn.innerHTML = 'Salvar Alterações'; btn.disabled = false; }
};
window.togA = async(id, s) => { await updateDoc(doc(db, "avisos", id), {ativo: s}); loadAvisos(); };

async function loadTema() {
    const t = await getDoc(doc(db, "config", "tema"));
    if(t.exists()) {
        const d = t.data();
        if(d.bg) document.getElementById('cor-bg').value = d.bg;
        if(d.card) document.getElementById('cor-card').value = d.card;
        if(d.txt) document.getElementById('cor-txt').value = d.txt;
        if(d.acc) document.getElementById('cor-acc').value = d.acc;
    }
}
document.getElementById('form-cores').onsubmit = async(e) => {
    e.preventDefault(); await setDoc(doc(db, "config", "tema"), { bg: document.getElementById('cor-bg').value, card: document.getElementById('cor-card').value, txt: document.getElementById('cor-txt').value, acc: document.getElementById('cor-acc').value });
    alert("Identidade visual aplicada aos sites!");
};

document.getElementById('form-carrossel').onsubmit = async(e) => {
    e.preventDefault(); const btn = document.getElementById('btn-up-car'); btn.textContent = "Enviando fotos..."; btn.disabled = true;
    try { for(let f of document.getElementById('car-files').files) { let url = await upImg(f); if(url) await addDoc(collection(db, "carrossel"), { url }); }
        alert("Carrossel Atualizado!"); loadCarrossel(); e.target.reset(); 
    } catch(err) { console.error(err); } finally { btn.textContent = "Adicionar ao Carrossel"; btn.disabled = false; }
};

async function loadCarrossel() {
    const s = await getDocs(collection(db, "carrossel")); const div = document.getElementById("galeria-preview"); div.innerHTML = "";
    s.forEach(d => { div.innerHTML += `<div style="position:relative;"><img src="${d.data().url}" style="width:120px; height:120px; object-fit:cover; border-radius:15px; border:2px solid var(--favu-rust);"><button style="position:absolute; top:-8px; right:-8px; background:#E60000; color:white; border:none; border-radius:50%; width:25px; height:25px; cursor:pointer;" onclick="window.delDoc('carrossel','${d.id}')"><i class="fas fa-times"></i></button></div>`; });
}

window.delDoc = async(col, id) => { if(confirm("Excluir definitivamente?")) { await deleteDoc(doc(db, col, id)); if(col==='avisos') loadAvisos(); if(col==='carrossel') loadCarrossel(); }};

async function init() { await syncCats(); await loadProds(); loadAvisos(); loadTema(); loadCarrossel(); }
init();