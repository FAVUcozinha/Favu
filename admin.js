import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const app = initializeApp({
    apiKey: "AIzaSyD5JlV7R2w629uiescD4AiixNAr-Qt0qI0",
    authDomain: "favu-app.firebaseapp.com",
    projectId: "favu-app",
    storageBucket: "favu-app.firebasestorage.app",
    messagingSenderId: "793414871188",
    appId: "1:793414871188:web:07ab447df44d742e022c81"
});

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

let globalCategories = [];
let allProducts = [];
let allEstoque = []; 
let allAvisos = [];
let currentAvisosTab = 'ativos';
let currentCategoryFilter = '';

// ==========================================
// ESTADOS GLOBAIS DE PEDIDOS
// ==========================================
window.todosPedidos = [];
window.ticketsSelecionados = new Set();
window.isDragEnabled = window.innerWidth > 768; 
window.currentCalendarDate = new Date();
window.dataInicialIntervalo = null;
window.dataFinalIntervalo = null;

window.STATUS_FLOW = [
    'Pedidos Orçados',
    'Pedido Recebido',
    'Pedido Confirmado',
    'Retirada',
    'Entregue',
    'Cancelado'
];

// ==========================================
// FORMATADOR DE TEXTO 
// ==========================================
window.formatText = function(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*([\s\S]*?)\*/g, '<strong>$1</strong>')
        .replace(/_([\s\S]*?)_/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
};

// ==========================================
// REGRA RESTRITA DE ORDEM ALFABÉTICA 
// ==========================================
window.sortAlfabetico = (a, b) => {
    return (a || '').toString().localeCompare((b || '').toString(), 'pt-BR', { sensitivity: 'base' });
};

// ==========================================
// LÓGICA DE ORDENAÇÃO DE PRODUTOS
// ==========================================
const sortProducts = (a, b) => {
    const nomeA = (a.nome || '').trim().toLowerCase();
    const nomeB = (b.nome || '').trim().toLowerCase();
    if (nomeA !== nomeB) return nomeA.localeCompare(nomeB);
    const getTamPeso = (tam) => {
        if (!tam) return 99;
        const t = tam.trim().toLowerCase();
        if (t.startsWith('p')) return 1;
        if (t.startsWith('m')) return 2;
        if (t.startsWith('g')) return 3;
        if (t.startsWith('u')) return 4;
        return 99;
    };
    return getTamPeso(a.tamanho) - getTamPeso(b.tamanho);
};

// ==========================================
// FECHAR MODAIS COM ESC
// ==========================================
document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        document.querySelectorAll('.modal.show').forEach(m => window.closeModal(m.id));
        document.querySelectorAll('.modal-direct').forEach(m => m.style.display = 'none');
    }
});

// ==========================================
// ALERTAS E TOASTS INTELIGENTES
// ==========================================
window.customAlert = function(msg, title = "Sucesso!") {
    // Se for sucesso, não trava a tela, mostra o Toast silencioso!
    if (title === "Sucesso!" || title === "Sucesso") {
        window.showToast(msg);
        return;
    }
    // Se for erro ou aviso importante, mantém o popup
    const modal = document.getElementById('custom-alert');
    document.getElementById('alert-title').textContent = title;
    document.getElementById('alert-msg').textContent = msg;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

window.customConfirm = function(msg, onConfirm) {
    const modal = document.getElementById('custom-confirm');
    document.getElementById('confirm-msg').textContent = msg;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    
    const btn = document.getElementById('confirm-btn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
        if(onConfirm) onConfirm();
    });
}

// ==========================================
// SISTEMA DE LOGIN SEGURO (FIREBASE AUTH)
// ==========================================
window.fazerLogin = async function() {
    const email = document.getElementById("login-user").value.trim();
    const pass = document.getElementById("login-pass").value.trim();
    const errorMsg = document.getElementById("login-error");
    const btn = document.querySelector("#login-screen .btn-primary");

    if (!email || !pass) {
        errorMsg.textContent = "Preencha e-mail e senha.";
        errorMsg.style.display = "block";
        return;
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
    btn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        errorMsg.style.display = "none";
    } catch (error) {
        console.error("Erro no login:", error);
        errorMsg.textContent = "Credenciais inválidas ou sem permissão.";
        errorMsg.style.display = "block";
    } finally {
        btn.innerHTML = 'Entrar';
        btn.disabled = false;
    }
};

window.fazerLogout = async function() {
    try {
        await signOut(auth);
        window.toggleMenu(false); 
    } catch (error) {
        console.error("Erro ao sair:", error);
    }
};


// ==========================================
// MOSTRAR/OCULTAR SENHA
// ==========================================
window.togglePasswordVisibility = function() {
    const passInput = document.getElementById("login-pass");
    const eyeIcon = document.getElementById("eye-icon");
    if (passInput.type === "password") {
        passInput.type = "text";
        eyeIcon.classList.remove("fa-eye");
        eyeIcon.classList.add("fa-eye-slash");
    } else {
        passInput.type = "password";
        eyeIcon.classList.remove("fa-eye-slash");
        eyeIcon.classList.add("fa-eye");
    }
};

// ==========================================
// RECUPERAÇÃO DE SENHA (POPUP DEDICADO)
// ==========================================
window.abrirModalRecuperarSenha = function() {
    // Pega o e-mail que o usuário já tentou digitar na tela de login e preenche automaticamente
    const emailDigitado = document.getElementById("login-user").value.trim();
    document.getElementById("recuperar-email").value = emailDigitado;
    
    // Reseta as mensagens de erro/sucesso do popup toda vez que ele é aberto
    const msgEl = document.getElementById("recuperar-msg");
    msgEl.style.display = "none";
    msgEl.textContent = "";
    
    // Volta o botão ao estado normal
    const btn = document.getElementById("btn-enviar-recuperacao");
    btn.innerHTML = 'Enviar link de acesso';
    btn.disabled = false;
    
    window.openModal('modal-recuperar-senha');
};

window.enviarEmailRecuperacao = async function() {
    const email = document.getElementById("recuperar-email").value.trim();
    const msgEl = document.getElementById("recuperar-msg");
    const btn = document.getElementById("btn-enviar-recuperacao");

    if (!email) {
        msgEl.textContent = "Por favor, digite um e-mail válido.";
        msgEl.style.color = "#E60000"; // Vermelho para erro
        msgEl.style.display = "block";
        return;
    }

    // Efeito visual de carregamento
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    btn.disabled = true;

    try {
        await sendPasswordResetEmail(auth, email);
        
        // Mensagem de sucesso limpa usando a fonte do sistema
        msgEl.textContent = "E-mail enviado! Verifique sua caixa de entrada e sua pasta de Spam.";
        msgEl.style.color = "#28a745"; // Verde para sucesso
        msgEl.style.display = "block";
        
        // Fecha o modal automaticamente após 4 segundos para UX mais fluida
        setTimeout(() => {
            window.closeModal('modal-recuperar-senha');
        }, 4000);
        
    } catch (error) {
        console.error("Erro ao enviar e-mail de recuperação:", error);
        msgEl.textContent = "Erro ao enviar. Verifique se o e-mail digitado está correto.";
        msgEl.style.color = "#E60000"; // Vermelho para erro
        msgEl.style.display = "block";
        
        btn.innerHTML = 'Enviar link de acesso';
        btn.disabled = false;
    }
};

// ==========================================
// COMPRESSÃO E UPLOAD DE IMAGEM
// ==========================================
window.compressImage = function(file, maxWidth = 900, maxHeight = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error("Nenhum arquivo selecionado."));
        if (!file.type || !file.type.startsWith("image/")) {
            return reject(new Error("O arquivo selecionado não é uma imagem válida."));
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
        reader.onload = event => {
            const img = new Image();
            img.onerror = () => reject(new Error("Não foi possível carregar a imagem para compactação."));
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round(height * (maxWidth / width));
                        width = maxWidth;
                    }
                } else if (height > maxHeight) {
                    width = Math.round(width * (maxHeight / height));
                    height = maxHeight;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(blob => {
                    if (!blob) return reject(new Error("Não foi possível compactar a imagem."));

                    const baseName = (file.name || "imagem")
                        .replace(/\.[^/.]+$/, "")
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-zA-Z0-9_-]/g, '_')
                        .slice(0, 60);

                    resolve(new File([blob], `${baseName || 'imagem'}.jpg`, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    }));
                }, 'image/jpeg', quality);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
};

window.fileToDataURL = function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Não foi possível converter a imagem."));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
};

// Enquanto o CORS do Firebase Storage não estiver corrigido, deixe false.
// Assim as imagens são salvas diretamente no Firestore como Base64 e o site volta a funcionar sem erro de CORS.
// Depois de aplicar o cors.json no bucket, você pode trocar para true.
const USAR_FIREBASE_STORAGE = false;

async function salvarImagemBase64(compressedFile) {
    const dataUrl = await window.fileToDataURL(compressedFile);

    // Evita estourar o limite de 1MB por documento do Firestore.
    if (dataUrl.length > 900000) {
        throw new Error("Imagem compactada ficou grande demais para salvar no banco. Tente uma imagem menor.");
    }

    return dataUrl;
}

async function upImg(file) {
    if (!file) return "";

    let compressedFile;
    try {
        compressedFile = await window.compressImage(file);
    } catch (e) {
        console.error("Erro ao compactar imagem:", e);
        customAlert("Não foi possível preparar a imagem selecionada.", "Erro no upload");
        throw e;
    }

    // MODO COMPATIBILIDADE: não chama o Storage, então não gera erro de CORS.
    if (!USAR_FIREBASE_STORAGE) {
        try {
            return await salvarImagemBase64(compressedFile);
        } catch (fallbackError) {
            console.error("Falha ao salvar imagem em Base64:", fallbackError);
            customAlert("Erro ao salvar imagem. Tente uma imagem menor ou mais leve.", "Erro no upload");
            throw fallbackError;
        }
    }

    // MODO STORAGE: use somente depois de aplicar corretamente o CORS no bucket.
    try {
        const safeName = compressedFile.name || `imagem_${Date.now()}.jpg`;
        const filename = `imagens/${Date.now()}_${safeName}`;
        const storageRef = ref(storage, filename);

        const snapshot = await uploadBytes(storageRef, compressedFile, {
            contentType: 'image/jpeg',
            cacheControl: 'public,max-age=31536000'
        });

        return await getDownloadURL(snapshot.ref);
    } catch (storageError) {
        console.warn("Firebase Storage bloqueou o upload. Usando fallback em Base64 no Firestore:", storageError);
        try {
            return await salvarImagemBase64(compressedFile);
        } catch (fallbackError) {
            console.error("Falha também no fallback de imagem:", fallbackError);
            customAlert("Erro ao enviar imagem. Verifique o CORS/permissões do Firebase Storage ou tente uma imagem menor.", "Erro no upload");
            throw fallbackError;
        }
    }
}
window.upImg = upImg;

window.previewImage = function(input, imgId, btnId, noneId, hiddenFlagId) {
    const file = input.files[0];
    const img = document.getElementById(imgId);
    const btn = btnId ? document.getElementById(btnId) : null;
    const noneTxt = noneId ? document.getElementById(noneId) : null;
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            img.src = e.target.result; img.style.display = 'block';
            if(btn) btn.style.display = 'inline-block';
            if(noneTxt) noneTxt.style.display = 'none';
        }
        reader.readAsDataURL(file);
        if(hiddenFlagId && document.getElementById(hiddenFlagId)) document.getElementById(hiddenFlagId).value = 'false';
    }
};

window.markImageForRemoval = function(type) {
    if(type === 'prod') {
        document.getElementById('e-img-preview').style.display = 'none'; document.getElementById('e-img-preview').src = '';
        document.getElementById('btn-remove-e-img').style.display = 'none'; document.getElementById('e-img-none').style.display = 'block';
        document.getElementById('e-file').value = ''; document.getElementById('e-file-name').textContent = '';
        document.getElementById('e-remove-img').value = 'true';
    } else if (type === 'aviso') {
        document.getElementById('ea-img-preview').style.display = 'none'; document.getElementById('ea-img-preview').src = '';
        document.getElementById('btn-remove-ea-img').style.display = 'none'; document.getElementById('ea-img-none').style.display = 'block';
        document.getElementById('ea-file').value = ''; document.getElementById('ea-file-name').textContent = '';
        document.getElementById('ea-remove-img').value = 'true';
    }
};

window.toggleAll = function(headerCheckbox, type) {
    document.querySelectorAll(`#tbl-${type} .row-checkbox`).forEach(cb => cb.checked = headerCheckbox.checked);
    window.checkSelection(type);
};

window.checkSelection = function(type) {
    const checked = document.querySelectorAll(`#tbl-${type} .row-checkbox:checked`).length;
    const bar = document.getElementById(`bulk-actions-${type}`);
    const countEl = document.getElementById(`count-${type}`);
    if (countEl) countEl.textContent = checked;

    if (type === 'categorias') {
        const label = document.getElementById('bulk-label-categorias');
        if (label) label.innerHTML = `<strong id="count-categorias">${checked}</strong> ${checked === 1 ? 'categoria' : 'categorias'}`;
    }
    if (type === 'avisos') {
        const label = document.getElementById('bulk-label-avisos');
        if (label) label.innerHTML = `<strong id="count-avisos">${checked}</strong> ${checked === 1 ? 'comunicado' : 'comunicados'}`;
    }

    if(checked > 0) bar.classList.add('active'); else bar.classList.remove('active');
};

window.clearSelection = function(type) {
    document.querySelectorAll(`#tbl-${type} .row-checkbox`).forEach(cb => cb.checked = false);
    const headerCb = document.querySelector(`#tbl-${type} th .bulk-checkbox`);
    if(headerCb) headerCb.checked = false;
    window.checkSelection(type);
};

window.bulkToggle = async function(type, status) {
    const checkboxes = document.querySelectorAll(`#tbl-${type} .row-checkbox:checked`);
    if(checkboxes.length === 0) return;
    for(let cb of checkboxes) await updateDoc(doc(db, type, cb.value), {ativo: status});
    customAlert(`Status alterado com sucesso!`);
    window.clearSelection(type);
    if(type === 'produtos') loadProds(); if(type === 'categorias') syncCats(); if(type === 'avisos') loadAvisos();
};

window.bulkDelete = function(type) {
    const checkboxes = document.querySelectorAll(`#tbl-${type} .row-checkbox:checked`);
    if(checkboxes.length === 0) return;
    customConfirm(`Excluir permanentemente ${checkboxes.length} item(ns)?`, async () => {
        for(let cb of checkboxes) await deleteDoc(doc(db, type, cb.value));
        customAlert("Itens excluídos!"); window.clearSelection(type);
        if(type === 'produtos') loadProds(); if(type === 'categorias') syncCats(); if(type === 'avisos') loadAvisos();
    });
};

document.getElementById('search-cat').addEventListener('input', () => { window.renderCatsTable(); });
window.limparFiltroCategorias = function() {
    const campo = document.getElementById('search-cat');
    if (campo) campo.value = '';
    window.renderCatsTable();
};

function normalizeDateBR(dateValue) {
    if (!dateValue) return '-';
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        const [y, m, d] = dateValue.split('-');
        return `${d}/${m}/${y}`;
    }
    const d = new Date(dateValue);
    return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
}

function getScheduleParts(c, prefix) {
    const dateKey = `${prefix}Data`;
    const timeKey = `${prefix}Hora`;
    let data = c[dateKey] || '';
    let hora = c[timeKey] || '';

    // Compatibilidade com categorias antigas que só tinham timestamp em inicio/fim
    const timestamp = c[prefix];
    if ((!data || !hora) && timestamp) {
        const tzOffset = (new Date()).getTimezoneOffset() * 60000;
        const d = new Date(timestamp - tzOffset);
        if (!isNaN(d.getTime())) {
            if (!data) data = d.toISOString().split('T')[0];
            if (!hora) hora = d.toISOString().split('T')[1].slice(0, 5);
        }
    }

    return { data, hora };
}

function formatScheduleValue(data, hora) {
    const dataBR = normalizeDateBR(data);
    const parts = [];

    if (dataBR && dataBR !== '-') parts.push(dataBR);
    if (hora) parts.push(hora);

    return parts.length ? parts.join(' | ') : '-';
}

function formatScheduleLine(label, data, hora) {
    const value = formatScheduleValue(data, hora);
    return value === '-' ? '' : `${label}: ${value}`;
}

function buildOptionalTimestamp(data, hora, isFim = false) {
    // Permite salvar apenas data ou apenas hora. Timestamp só existe quando há data.
    if (!data) return null;
    const finalHora = hora || (isFim ? '23:59' : '00:00');
    const d = new Date(`${data}T${finalHora}`);
    return isNaN(d.getTime()) ? null : d.getTime();
}

function getCategoriaTimestamp(c, prefix) {
    if (!c) return null;
    const existente = c[prefix];
    if (existente) return existente;
    return buildOptionalTimestamp(c[`${prefix}Data`] || '', c[`${prefix}Hora`] || '', prefix === 'fim');
}

function isCategoriaVisivelAgora(c) {
    if (!c || c.ativo === false) return false;

    const agora = Date.now();
    const inicio = getCategoriaTimestamp(c, 'inicio');
    const fim = getCategoriaTimestamp(c, 'fim');

    if (inicio && agora < inicio) return false;
    if (fim && agora > fim) return false;

    return true;
}


function getCatScheduleFromForm(prefix) {
    const inicioData = document.getElementById(`${prefix}-inid`).value || '';
    const inicioHora = document.getElementById(`${prefix}-inih`).value || '';
    const fimData = document.getElementById(`${prefix}-fimd`).value || '';
    const fimHora = document.getElementById(`${prefix}-fimh`).value || '';

    return {
        inicioData,
        inicioHora,
        fimData,
        fimHora,
        inicio: buildOptionalTimestamp(inicioData, inicioHora, false),
        fim: buildOptionalTimestamp(fimData, fimHora, true)
    };
}

function orderedCategoriesList() {
    return [...globalCategories].sort((a, b) => {
        const ao = (a.ordem !== undefined && a.ordem !== null && Number.isFinite(Number(a.ordem))) ? Number(a.ordem) : null;
        const bo = (b.ordem !== undefined && b.ordem !== null && Number.isFinite(Number(b.ordem))) ? Number(b.ordem) : null;
        if (ao !== null && bo !== null && ao !== bo) return ao - bo;
        if (ao !== null && bo === null) return -1;
        if (ao === null && bo !== null) return 1;
        return window.sortAlfabetico(a.nome, b.nome);
    });
}

async function reorderCategoriesAlphabetically() {
    const snap = await getDocs(collection(db, "categorias"));
    const cats = [];
    snap.forEach(d => cats.push({ id: d.id, ...d.data() }));
    cats.sort((a, b) => window.sortAlfabetico(a.nome, b.nome));
    await Promise.all(cats.map((c, index) => updateDoc(doc(db, "categorias", c.id), { ordem: index })));
}

async function syncCats() {
    const snap = await getDocs(collection(db, "categorias"));
    globalCategories = []; snap.forEach(d => { const c = d.data(); c.id = d.id; globalCategories.push(c); });
    window.renderCatsTable();
}


function sanitizeRichText(html) {
    const raw = (html || '').toString();
    const container = document.createElement('div');
    container.innerHTML = raw;

    const allowedTags = ['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'SPAN'];
    const allowedAlignments = ['left', 'right', 'center', 'justify'];
    const walk = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);

    nodes.forEach(node => {
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
        if (allowedAlignments.includes(textAlign)) node.style.textAlign = textAlign;
    });

    return container.innerHTML
        .replace(/<div><br><\/div>/gi, '<br>')
        .replace(/<p><br><\/p>/gi, '<br>')
        .trim();
}

window.focusCatEditor = function(prefix) {
    const editor = document.getElementById(`${prefix}-obs-editor`);
    if (editor) editor.focus();
};

window.execCatRichText = function(command, prefix) {
    const editor = prefix ? document.getElementById(`${prefix}-obs-editor`) : document.querySelector('.cat-rich-editor:focus');
    if (editor) editor.focus();
    document.execCommand(command, false, null);
};

window.getCatRichText = function(prefix) {
    const editor = document.getElementById(`${prefix}-obs-editor`);
    if (!editor) return document.getElementById(`${prefix}-obs`)?.value?.trim() || '';
    const html = sanitizeRichText(editor.innerHTML);
    const hidden = document.getElementById(`${prefix}-obs`);
    if (hidden) hidden.value = html;
    return html;
};

window.setCatRichText = function(prefix, value) {
    const editor = document.getElementById(`${prefix}-obs-editor`);
    const hidden = document.getElementById(`${prefix}-obs`);
    const safe = sanitizeRichText(value || '');
    if (editor) editor.innerHTML = safe;
    if (hidden) hidden.value = safe;
};

// ==========================================
// EDITOR RICO DE COMUNICADOS
// ==========================================
window.focusAvisoEditor = function(prefix) {
    const editor = document.getElementById(`${prefix}-txt-editor`);
    if (editor) editor.focus();
};

window.execAvisoRichText = function(command, prefix) {
    const editor = document.getElementById(`${prefix}-txt-editor`);
    if (editor) editor.focus();
    document.execCommand(command, false, null);
};

window.getAvisoRichText = function(prefix) {
    const editor = document.getElementById(`${prefix}-txt-editor`);
    const hidden = document.getElementById(`${prefix}-txt`);
    const html = editor ? sanitizeRichText(editor.innerHTML) : (hidden?.value || '').trim();
    if (hidden) hidden.value = html;
    return html;
};

window.setAvisoRichText = function(prefix, value) {
    const editor = document.getElementById(`${prefix}-txt-editor`);
    const hidden = document.getElementById(`${prefix}-txt`);
    const safe = sanitizeRichText(value || '');
    if (editor) editor.innerHTML = safe;
    if (hidden) hidden.value = safe;
};

window.setAvisoImagePosition = function(prefix, value) {
    const input = document.getElementById(`${prefix}-img-pos`);
    if (input) input.value = value;
    ['top', 'bottom'].forEach(pos => {
        const btn = document.getElementById(`${prefix}-img-pos-${pos}`);
        if (btn) btn.classList.toggle('active', pos === value);
    });
};

function formatAvisoScheduleLine(label, timestamp) {
    if (!timestamp || isNaN(Number(timestamp))) return '';
    const d = new Date(Number(timestamp));
    if (isNaN(d.getTime())) return '';
    const data = d.toLocaleDateString('pt-BR');
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${label}: ${data} | ${hora}`;
}

function renderAvisoScheduleHtml(a) {
    const linhas = [
        formatAvisoScheduleLine('Início', a.inicio),
        formatAvisoScheduleLine('Fim', a.fim)
    ].filter(Boolean);
    return linhas.length ? linhas.map(l => `<span class="aviso-period-line">${l}</span>`).join('') : '<span class="aviso-period-line">-</span>';
}

function getAvisoScheduleValue(timestamp) {
    if (!timestamp || isNaN(Number(timestamp))) return '-';
    const d = new Date(Number(timestamp));
    if (isNaN(d.getTime())) return '-';
    return `${d.toLocaleDateString('pt-BR')} | ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}


function buildOptionalAvisoTimestamp(data, hora, isFim = false) {
    if (!data) return null;
    const finalHora = hora || (isFim ? '23:59' : '00:00');
    const d = new Date(`${data}T${finalHora}`);
    return isNaN(d.getTime()) ? null : d.getTime();
}

function getAvisoScheduleFromForm(prefix) {
    const inicioData = document.getElementById(`${prefix}-inid`).value || '';
    const inicioHora = document.getElementById(`${prefix}-inih`).value || '';
    const fimData = document.getElementById(`${prefix}-fimd`).value || '';
    const fimHora = document.getElementById(`${prefix}-fimh`).value || '';
    return {
        inicio: buildOptionalAvisoTimestamp(inicioData, inicioHora, false),
        fim: buildOptionalAvisoTimestamp(fimData, fimHora, true)
    };
}

function setAvisoScheduleFields(prefix, inicio, fim) {
    const setParts = (base, timestamp) => {
        const dataEl = document.getElementById(`${prefix}-${base}d`);
        const horaEl = document.getElementById(`${prefix}-${base}h`);
        if (!timestamp || isNaN(Number(timestamp))) {
            if (dataEl) dataEl.value = '';
            if (horaEl) horaEl.value = '';
            return;
        }
        const tzOffset = (new Date()).getTimezoneOffset() * 60000;
        const d = new Date(Number(timestamp) - tzOffset);
        if (isNaN(d.getTime())) return;
        if (dataEl) dataEl.value = d.toISOString().split('T')[0];
        if (horaEl) horaEl.value = d.toISOString().split('T')[1].slice(0, 5);
    };
    setParts('ini', inicio);
    setParts('fim', fim);
}

function getAvisoStatus(a) {
    const isAtivo = a.ativo !== false;
    const agora = Date.now();
    const inicio = Number(a.inicio) || 0;
    const fim = Number(a.fim) || 0;
    if (!isAtivo) return { st: 'Oculto', stClass: 'inativo', grupo: 'inativos' };
    if (inicio && agora < inicio) return { st: 'Agendado', stClass: 'agendado', grupo: 'ativos' };
    if (!fim || agora <= fim) return { st: 'Andamento', stClass: 'ativo', grupo: 'ativos' };
    return { st: 'Concluso', stClass: 'concluso', grupo: 'inativos' };
}

function orderedAvisosList() {
    return [...allAvisos].sort((a, b) => {
        const ao = (a.ordem !== undefined && a.ordem !== null && Number.isFinite(Number(a.ordem))) ? Number(a.ordem) : null;
        const bo = (b.ordem !== undefined && b.ordem !== null && Number.isFinite(Number(b.ordem))) ? Number(b.ordem) : null;
        if (ao !== null && bo !== null && ao !== bo) return ao - bo;
        if (ao !== null && bo === null) return -1;
        if (ao === null && bo !== null) return 1;
        return (Number(a.inicio) || 0) - (Number(b.inicio) || 0);
    });
}

window.switchAvisosTab = function(tab) {
    currentAvisosTab = tab === 'inativos' ? 'inativos' : 'ativos';
    document.getElementById('tab-avisos-ativos')?.classList.toggle('active', currentAvisosTab === 'ativos');
    document.getElementById('tab-avisos-inativos')?.classList.toggle('active', currentAvisosTab === 'inativos');
    window.clearSelection('avisos');
    window.renderAvisosTable();
};

function renderClickableAvisoImage(url, className = 'img-preview') {
    if (!url) return '';
    const safeUrl = escapeHTML(url);
    return `<img src="${safeUrl}" class="${className} aviso-clickable-img" alt="Imagem do comunicado" title="Clique para ampliar" style="cursor:pointer;" onclick="event.stopPropagation(); window.openAvisoImagePreview(this.src)">`;
}

window.openAvisoImagePreview = function(url) {
    if (!url) return;

    let modal = document.getElementById('modal-preview-aviso-img');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-preview-aviso-img';
        modal.className = 'modal';
        modal.style.zIndex = '100001';
        modal.onclick = function(event) {
            if (event.target === modal) window.closeAvisoImagePreview();
        };

        modal.innerHTML = `
            <div class="popup-conteudo" style="max-width: 920px; padding: 22px; position: relative;">
                <button class="close-modal" style="position:absolute; right:18px; top:12px;" onclick="window.closeAvisoImagePreview()">&times;</button>
                <img id="aviso-img-preview-expanded" alt="Imagem do comunicado ampliada" style="display:block; max-width:100%; max-height:75vh; object-fit:contain; border-radius:16px; margin:0 auto;">
            </div>
        `;
        document.body.appendChild(modal);
    }

    const img = document.getElementById('aviso-img-preview-expanded');
    if (img) img.src = url;

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
};

window.closeAvisoImagePreview = function() {
    const modal = document.getElementById('modal-preview-aviso-img');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        const img = document.getElementById('aviso-img-preview-expanded');
        if (img) img.src = '';
    }, 300);
};

function buildAvisoMobilePreview(a) {
    const pos = a.posicaoImagem || 'top';
    const img = a.imagemUrl ? renderClickableAvisoImage(a.imagemUrl, '') : '';
    const texto = sanitizeRichText(a.texto || '') || '-';
    return `<div class="aviso-mobile-preview aviso-img-${pos}">${pos === 'top' ? img : ''}<div class="aviso-mobile-text">${texto}</div>${pos === 'bottom' ? img : ''}</div>`;
}


function escapeHTML(value) {
    return (value || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function stripCatNotice(value) {
    const temp = document.createElement('div');
    temp.innerHTML = sanitizeRichText(value || '');
    return (temp.textContent || temp.innerText || '').replace(/\s+/g, ' ').trim();
}

function renderCatNoticeBadge(value) {
    const hasNotice = !!stripCatNotice(value);
    return `<span class="badge cat-notice-badge ${hasNotice ? 'ativo' : 'inativo'}">${hasNotice ? 'Possui' : 'Não possui'}</span>`;
}

function renderCatNoticeSummary(value) {
    return renderCatNoticeBadge(value);
}

function renderCatNoticeStatus(value) {
    return renderCatNoticeBadge(value);
}

window.renderCatsTable = function() {
    const tb = document.querySelector('#tbl-categorias tbody');
    tb.innerHTML = "";
    let opts = `<option value="">Selecione...</option>`;
    const searchTerm = document.getElementById('search-cat').value.toLowerCase();

    const sorted = orderedCategoriesList();
    sorted.forEach(c => { opts += `<option value="${c.nome}">${c.nome}</option>`; });

    sorted
        .filter(c => `${c.nome} ${c.minTotal||0} ${c.tipoColuna} ${c.mensagemObs||''} ${c.ativo?'ativa':'oculta'} ${getScheduleParts(c, 'inicio').data} ${getScheduleParts(c, 'fim').data}`.toLowerCase().includes(searchTerm))
        .forEach(c => {
            const isAtivo = c.ativo !== false;
            const ini = getScheduleParts(c, 'inicio');
            const fim = getScheduleParts(c, 'fim');
            const iniData = normalizeDateBR(ini.data);
            const fimData = normalizeDateBR(fim.data);
            const iniResumo = formatScheduleValue(ini.data, ini.hora);
            const fimResumo = formatScheduleValue(fim.data, fim.hora);
            const programacaoLinhas = [
                formatScheduleLine('Início', ini.data, ini.hora),
                formatScheduleLine('Fim', fim.data, fim.hora)
            ].filter(Boolean);
            const programacaoHtml = programacaoLinhas.length
                ? programacaoLinhas.map(linha => `<span class="cat-period-line">${linha}</span>`).join('')
                : '<span class="cat-period-line">-</span>';

            tb.innerHTML += `<tr data-cat-id="${c.id}" class="cat-row">
                <td class="cat-order-cell" data-label="Ordem:" style="text-align:center;"><button type="button" class="cat-drag-handle" title="Arrastar para reorganizar" onpointerdown="window.catPointerDown(event, '${c.id}')"><i class="fas fa-grip-lines"></i></button></td>
                <td class="cat-select-cell" data-label="Selecionar:" style="text-align:center;"><input type="checkbox" class="bulk-checkbox row-checkbox" value="${c.id}" onchange="window.checkSelection('categorias')"></td>
                <td class="cat-name-cell" data-label="Categoria:" onpointerdown="window.catMobilePointerDown(event, '${c.id}')"><strong style="color:var(--favu-rust); font-size:1.1rem;">${c.nome}</strong></td>
                <td class="cat-min-cell" data-label="Mínimo:">${c.minTotal ?? 0}</td>
                <td class="cat-medida-cell" data-label="Medida:">${c.tipoColuna || '-'}</td>
                <td class="cat-notice-cell" data-label="Aviso:"><small class="cat-notice-summary"><span class="cat-notice-desktop">${renderCatNoticeSummary(c.mensagemObs)}</span><span class="cat-notice-mobile">${renderCatNoticeStatus(c.mensagemObs)}</span></small></td>
                <td class="cat-period-cell desktop-schedule-cell" data-label="Programação:">
                    ${programacaoHtml}
                </td>
                <td class="cat-mobile-start mobile-schedule-cell" data-label="Início:">${iniResumo}</td>
                <td class="cat-mobile-end mobile-schedule-cell" data-label="Fim:">${fimResumo}</td>
                <td class="cat-status-cell" data-label="Status:"><span class="badge ${isAtivo ? 'ativo' : 'inativo'}">${isAtivo ? 'Ativa' : 'Oculta'}</span></td>
                <td class="cat-actions-cell" data-label="Ações:">
                    <div class="action-btns-wrapper">
                        <button class="btn-action edit" onclick="window.openEditCat('${c.id}')"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-action copy" title="Copiar categoria" onclick="window.copyCat('${c.id}')"><i class="fas fa-copy"></i></button>
                        <button class="btn-action toggle ${isAtivo ? 'cat-toggle-visible' : 'cat-toggle-hidden'}" onclick="window.togC('${c.id}', ${!isAtivo})"><i class="fas fa-${isAtivo?'eye':'eye-slash'}"></i></button>
                        <button class="btn-action del" onclick="window.delC('${c.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });

    document.querySelectorAll('.cat-select').forEach(sel => {
        const v = sel.value;
        sel.innerHTML = opts;
        sel.value = v;
    });
}

let draggingCategoryId = null;

window.catDragStart = function(event, id) {
    if (!event.target.closest('.cat-drag-handle')) {
        event.preventDefault();
        return;
    }
    draggingCategoryId = id;
    event.currentTarget.classList.add('cat-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
};

window.catDragOver = function(event) {
    event.preventDefault();
    const draggingRow = document.querySelector('#tbl-categorias tr.cat-dragging');
    const overRow = event.currentTarget;
    if (!draggingRow || draggingRow === overRow) return;
    const tbody = overRow.parentNode;
    const rect = overRow.getBoundingClientRect();
    const insertAfter = (event.clientY - rect.top) > rect.height / 2;
    tbody.insertBefore(draggingRow, insertAfter ? overRow.nextSibling : overRow);
};

window.catDrop = function(event) {
    event.preventDefault();
};

window.catDragEnd = async function(event) {
    event.currentTarget.classList.remove('cat-dragging');
    const rows = Array.from(document.querySelectorAll('#tbl-categorias tbody tr[data-cat-id]'));
    const ids = rows.map(row => row.dataset.catId);
    if (!ids.length || !draggingCategoryId) return;

    ids.forEach((id, index) => {
        const cat = globalCategories.find(c => c.id === id);
        if (cat) cat.ordem = index;
    });

    try {
        await Promise.all(ids.map((id, index) => updateDoc(doc(db, "categorias", id), { ordem: index })));
    } catch (err) {
        console.error('Erro ao salvar ordem das categorias:', err);
        customAlert('Não foi possível salvar a nova ordem das categorias.', 'Atenção');
        syncCats();
    } finally {
        draggingCategoryId = null;
    }
};


let catPointerDrag = null;

function persistCategoryOrderFromDOM() {
    const rows = Array.from(document.querySelectorAll('#tbl-categorias tbody tr[data-cat-id]'));
    const ids = rows.map(row => row.dataset.catId);
    ids.forEach((id, index) => {
        const cat = globalCategories.find(c => c.id === id);
        if (cat) cat.ordem = index;
    });
    return Promise.all(ids.map((id, index) => updateDoc(doc(db, "categorias", id), { ordem: index })));
}

function startCategoryPointerSort(event, id, options = {}) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const handle = event.currentTarget;
    const row = handle.closest('tr[data-cat-id]');
    const tbody = row ? row.parentElement : null;
    if (!row || !tbody) return;

    if (event.target.closest('input, select, textarea, button:not(.cat-drag-handle), .btn-action, a')) return;

    event.preventDefault();
    event.stopPropagation();

    const delay = options.delay || 0;
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;
    let didMove = false;
    let cancelled = false;
    let timer = null;

    const begin = () => {
        if (active || cancelled) return;
        active = true;
        draggingCategoryId = id;
        catPointerDrag = { row, id };
        row.classList.add('cat-dragging');
        document.body.classList.add('cat-sorting-active');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    };

    const moveRowByPointer = (clientY) => {
        const rows = Array.from(tbody.querySelectorAll('tr[data-cat-id]')).filter(r => r !== row);
        if (!rows.length) return;

        for (const targetRow of rows) {
            const rect = targetRow.getBoundingClientRect();
            const middle = rect.top + rect.height / 2;
            if (clientY < middle) {
                if (row.nextElementSibling !== targetRow) tbody.insertBefore(row, targetRow);
                return;
            }
        }
        tbody.appendChild(row);
    };

    const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('pointercancel', onUp, true);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    };

    const cancelBeforeStart = () => {
        cancelled = true;
        cleanup();
    };

    const onMove = (moveEvent) => {
        const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);

        if (!active) {
            // Em telas não desktop, permite clicar/segurar e mover a categoria.
            // Antes o movimento antes do timeout cancelava o drag, deixando a linha travada.
            if (delay && dist > 8) {
                begin();
            } else if (!delay) {
                begin();
            } else {
                return;
            }
        }

        didMove = true;
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        moveRowByPointer(moveEvent.clientY);
    };

    const onUp = async (upEvent) => {
        cleanup();
        if (!active) return;

        upEvent.preventDefault();
        upEvent.stopPropagation();

        row.classList.remove('cat-dragging');
        document.body.classList.remove('cat-sorting-active');
        catPointerDrag = null;

        try {
            if (didMove) await persistCategoryOrderFromDOM();
        } catch (err) {
            console.error('Erro ao salvar ordem das categorias:', err);
            customAlert('Não foi possível salvar a nova ordem das categorias.', 'Atenção');
            syncCats();
        } finally {
            draggingCategoryId = null;
        }
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);

    if (delay) timer = setTimeout(begin, delay);
    else begin();
}

window.catPointerDown = function(event, id) {
    event.preventDefault();
    startCategoryPointerSort(event, id, { delay: 0 });
};

window.catMobilePointerDown = function(event, id) {
    if (window.innerWidth > 1024) return;
    event.preventDefault();
    startCategoryPointerSort(event, id, { delay: 280 });
};

document.getElementById('form-add-cat').onsubmit = async(e) => {
    e.preventDefault(); 
    const nm = document.getElementById('ac-nome').value.trim();
    const schedule = getCatScheduleFromForm('ac');
    const agendar = !!(schedule.inicioData || schedule.inicioHora || schedule.fimData || schedule.fimHora);

    await setDoc(doc(db, "categorias", nm.toLowerCase().replace(/\s/g, '-')), { 
        nome: nm, 
        minTotal: parseInt(document.getElementById('ac-min').value)||0, 
        tipoColuna: document.getElementById('ac-col').value, 
        mensagemObs: window.getCatRichText('ac'), 
        ativo: true, 
        minIndividual: true,
        agendarVisibilidade: agendar,
        ...schedule
    }); 
    await reorderCategoriesAlphabetically();
    customAlert("Categoria Criada!"); window.closeModal('modal-add-cat', 'form-add-cat'); syncCats();
};

window.openEditCat = async(id) => {
    const c = (await getDoc(doc(db, "categorias", id))).data();
    document.getElementById('ec-id').value = id; 
    document.getElementById('ec-nome').value = c.nome;
    document.getElementById('ec-min').value = c.minTotal; 
    document.getElementById('ec-col').value = c.tipoColuna;
    window.setCatRichText('ec', c.mensagemObs || ''); 
    
    const ini = getScheduleParts(c, 'inicio');
    const fim = getScheduleParts(c, 'fim');
    document.getElementById('ec-inid').value = ini.data || '';
    document.getElementById('ec-inih').value = ini.hora || '';
    document.getElementById('ec-fimd').value = fim.data || '';
    document.getElementById('ec-fimh').value = fim.hora || '';

    window.openModal('modal-editar-cat');
};

document.getElementById('form-edit-cat').onsubmit = async(e) => {
    e.preventDefault();
    
    const schedule = getCatScheduleFromForm('ec');
    const agendar = !!(schedule.inicioData || schedule.inicioHora || schedule.fimData || schedule.fimHora);

    await updateDoc(doc(db, "categorias", document.getElementById('ec-id').value), { 
        nome: document.getElementById('ec-nome').value.trim(), 
        minTotal: parseInt(document.getElementById('ec-min').value)||0, 
        tipoColuna: document.getElementById('ec-col').value, 
        mensagemObs: window.getCatRichText('ec'),
        agendarVisibilidade: agendar,
        ...schedule
    });
    customAlert("Categoria Atualizada!"); window.closeModal('modal-editar-cat', 'form-edit-cat'); syncCats(); loadProds();
};
window.togC = async(id, s) => { 
    await updateDoc(doc(db, "categorias", id), {ativo: s}); 
    const index = globalCategories.findIndex(c => c.id === id);
    if(index > -1) globalCategories[index].ativo = s;
    window.renderCatsTable(); 
};

window.delC = async(id) => { 
    customConfirm("Excluir categoria?", async () => { 
        await deleteDoc(doc(db, "categorias", id)); 
        globalCategories = globalCategories.filter(c => c.id !== id);
        window.renderCatsTable(); 
    }); 
};


window.copyCat = async function(id) {
    try {
        const origemSnap = await getDoc(doc(db, "categorias", id));
        if (!origemSnap.exists()) {
            customAlert("Categoria não encontrada para copiar.", "Atenção");
            return;
        }

        const origem = origemSnap.data();
        const nomesUsados = new Set(globalCategories.map(c => (c.nome || '').trim().toLowerCase()));
        const baseNome = `${origem.nome || 'Categoria'} (cópia)`;
        let novoNome = baseNome;
        let contador = 2;
        while (nomesUsados.has(novoNome.trim().toLowerCase())) {
            novoNome = `${baseNome} ${contador}`;
            contador++;
        }

        const ordered = orderedCategoriesList();
        const originalIndex = ordered.findIndex(c => c.id === id);
        const novaOrdem = originalIndex >= 0 ? originalIndex + 1 : ordered.length;

        const catsParaAtualizar = ordered
            .filter((c, index) => index >= novaOrdem)
            .map((c, index) => updateDoc(doc(db, "categorias", c.id), { ordem: novaOrdem + index + 1 }));

        await Promise.all(catsParaAtualizar);

        await addDoc(collection(db, "categorias"), {
            ...origem,
            nome: novoNome,
            ordem: novaOrdem
        });

        customAlert("Categoria copiada!");
        syncCats();
        loadProds();
    } catch (err) {
        console.error("Erro ao copiar categoria:", err);
        customAlert("Não foi possível copiar a categoria.", "Atenção");
    }
};

document.getElementById('a-cat').addEventListener('change', function() {
    const catObj = globalCategories.find(c => c.nome === this.value);
    const isSizeCategory = catObj && catObj.tipoColuna === 'Tamanho';
    document.getElementById('variations-container').innerHTML = '';
    window.addVariation(isSizeCategory);
    document.getElementById('btn-add-variation').style.display = isSizeCategory ? 'block' : 'none';
});

window.addVariation = (isSizeCategory = true, isMixed = false) => {
    const container = document.getElementById('variations-container');
    if (!container) return; 
    const div = document.createElement('div');
    div.className = 'variation-block';
    div.style = "background: rgba(224, 159, 65, 0.05); padding: 15px; border-radius: 10px; margin-bottom: 15px; border: 1px dashed rgba(224, 159, 65, 0.3); position: relative;";
    const btnRemove = (isSizeCategory && container.children.length > 0) ? `<button type="button" onclick="this.parentElement.remove()" style="position: absolute; top: 10px; right: 10px; background: white; color: #E60000; border: 1px solid #E60000; border-radius: 5px; font-size: 0.8rem; cursor: pointer; padding: 2px 8px;">Remover <i class="fas fa-times"></i></button>` : '';
    
    const req = isMixed ? '' : 'required';
    const labelSize = isMixed ? 'Tamanho (Vazio = Mín)' : 'Tamanho';
    
    const sizeFieldHtml = isSizeCategory ? `<div><label>${labelSize}</label><input type="text" class="v-tam" placeholder="Ex: P, M" ${req}></div>` : `<div style="display:none;"><input type="hidden" class="v-tam" value=""></div>`;

    div.innerHTML = `${btnRemove}
        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); margin-bottom: 0;">
            ${sizeFieldHtml}
            <div><label>Mínimo por Produto</label><input type="number" class="v-min" placeholder="Ex: 10"></div>
            <div><label>Preço (R$)</label><input type="number" step="0.01" class="v-preco" required style="font-family: var(--font-numbers) !important;"></div>
        </div>`;
    container.appendChild(div);
};

document.getElementById('a-cat').addEventListener('change', function() {
    const catObj = globalCategories.find(c => c.nome === this.value);
    const isSizeCategory = catObj && (catObj.tipoColuna === 'Tamanho' || catObj.tipoColuna === 'Tamanho/Minimo');
    const isMixed = catObj && catObj.tipoColuna === 'Tamanho/Minimo';
    
    document.getElementById('variations-container').innerHTML = '';
    window.addVariation(isSizeCategory, isMixed);
    document.getElementById('btn-add-variation').style.display = isSizeCategory ? 'block' : 'none';
});

window.handleBulkCategoryChange = (selectElement) => {
    const catObj = globalCategories.find(c => c.nome === selectElement.value);
    const container = selectElement.closest('.grid-row').querySelector('.b-variations-container');
    const addBtn = container.querySelector('.add-bulk-var-btn');
    const tamInputs = container.querySelectorAll('.b-tam');

    if (catObj && (catObj.tipoColuna === 'Tamanho' || catObj.tipoColuna === 'Tamanho/Minimo')) {
        tamInputs.forEach(i => { 
            i.disabled = false; 
            i.placeholder = catObj.tipoColuna === 'Tamanho/Minimo' ? "Tam (Vazio = Mín)" : "Tam"; 
            i.type = "text"; 
        });
        if(addBtn) addBtn.style.display = 'inline-block';
    } else {
        const varRows = container.querySelectorAll('.b-var-row');
        if(varRows.length > 1) for(let i=1; i<varRows.length; i++) varRows[i].remove();
        tamInputs.forEach(i => { i.disabled = true; i.value = ""; i.placeholder = "-"; });
        if(addBtn) addBtn.style.display = 'none';
    }
};

window.addBulkVariation = (btn) => {
    const div = document.createElement('div'); div.className = 'b-var-row'; div.style = "display:flex; gap:5px; align-items:center; margin-top:5px;";
    div.innerHTML = `<input type="text" class="b-tam" placeholder="Tam" style="width:60px;"><input type="number" step="0.01" class="b-preco" placeholder="R$" style="width:75px; font-family: var(--font-numbers) !important;"><input type="text" class="b-dres" placeholder="Desc. Resumo" style="flex:1;"><button type="button" onclick="this.parentElement.remove()" style="background:#fcc; border:none; border-radius:4px; cursor:pointer; width:28px; height:28px; font-weight:bold; color:#E60000;">&times;</button>`;
    btn.closest('.b-variations-container').appendChild(div);
};

window.addGridRow = () => {
    const d = document.createElement('div'); d.className = 'grid-row';
    let opts = `<option value="">Categoria...</option>`; globalCategories.forEach(cat => opts += `<option value="${cat.nome}">${cat.nome}</option>`);
    d.innerHTML = `<div><label class="bulk-file-upload"><i class="fas fa-camera" style="font-size: 1.2rem;"></i><input type="file" class="b-file" accept="image/*" onchange="this.parentElement.classList.add('has-file');"></label></div>
        <div><select class="b-cat cat-select" onchange="window.handleBulkCategoryChange(this)">${opts}</select></div>
        <div><textarea class="b-nome" rows="1" placeholder="Nome Produto"></textarea></div>
        <div><input type="number" class="b-min" value="1" style="font-family: var(--font-numbers) !important;"></div>
        <div><textarea class="b-dmenu" rows="2" placeholder="Desc. Produto"></textarea></div><div><textarea class="b-dpop" rows="2" placeholder="Desc. Imagem"></textarea></div>
        <div class="b-variations-container" style="display:flex; flex-direction:column;">
            <div class="b-var-row" style="display:flex; gap:5px; align-items:center;">
                <input type="text" class="b-tam" placeholder="(P - 1,5KG)" style="width:60px;" disabled><input type="number" step="0.01" class="b-preco" placeholder="R$" style="width:75px; font-family: var(--font-numbers) !important;"><input type="text" class="b-dres" placeholder="Desc. Resumo" style="flex:1;">
                <button type="button" class="add-bulk-var-btn" onclick="window.addBulkVariation(this)" style="background:#eee; border:none; border-radius:4px; cursor:pointer; width:28px; height:28px; font-weight:bold; color:var(--favu-rust); display:none;">+</button>
            </div>
        </div>
        <div style="display:flex; justify-content:center; padding-top:5px;"><button type="button" onclick="this.parentElement.remove()" style="background:none; color:#E60000; border:none; cursor:pointer; font-size:1.4rem;"><i class="fas fa-times-circle"></i></button></div>`;
    document.getElementById('bulk-rows').appendChild(d);
};

window.saveBulkItems = async() => {
    const btn = document.getElementById('btn-save-bulk'); 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subindo lote...'; 
    btn.disabled = true;
    
    try {
        const rows = Array.from(document.querySelectorAll('#bulk-rows .grid-row'));
        
        const promessas = rows.map(async (r) => {
            const nm = r.querySelector('.b-nome').value.trim(); 
            if(!nm) return; 
            
            let url = ""; 
            const f = r.querySelector('.b-file').files[0]; 
            if(f) url = await upImg(f); 
            
            const vars = Array.from(r.querySelectorAll('.b-var-row'));
            
            const varPromises = vars.map(vr => {
                return addDoc(collection(db, "produtos"), { 
                    nome: nm, 
                    categoria: r.querySelector('.b-cat').value, 
                    min: parseInt(r.querySelector('.b-min').value)||1, 
                    descricaoItem: r.querySelector('.b-dmenu').value.trim(), 
                    descricaoPopup: r.querySelector('.b-dpop').value.trim(), 
                    imagemUrl: url, 
                    ativo: true, 
                    tamanho: vr.querySelector('.b-tam').value.trim(), 
                    preco: parseFloat(vr.querySelector('.b-preco').value)||0, 
                    descricaoResumo: vr.querySelector('.b-dres').value.trim() 
                });
            });
            
            return Promise.all(varPromises);
        });

        await Promise.all(promessas);

        customAlert("Lote adicionado com sucesso!"); 
        document.getElementById('bulk-rows').innerHTML = ''; 
        window.closeModal('modal-bulk-prod'); 
        loadProds(); 
        
    } catch(err) { 
        console.error(err);
        customAlert("Erro ao salvar lote.", "Erro"); 
    } finally { 
        btn.innerHTML = 'Salvar'; 
        btn.disabled = false; 
    }
};

document.getElementById('search-prod').addEventListener('input', () => { window.renderProdsTable(); });

async function loadProds() {
    const s = await getDocs(collection(db, "produtos"));
    allProducts = []; s.forEach(d => allProducts.push({id: d.id, ...d.data()}));
    renderProdTabs(); window.renderProdsTable(); window.renderOrcamentoMenu(); 
}

function renderProdTabs() {
    const container = document.getElementById('prod-cats-nav');
    
    const catsUsed = [...new Set(allProducts.map(p => p.categoria || 'Sem Categoria'))].sort(window.sortAlfabetico);
    
    if (!currentCategoryFilter || !catsUsed.includes(currentCategoryFilter)) currentCategoryFilter = catsUsed[0] || '';
    let html = ''; catsUsed.forEach(c => html += `<button class="prod-tab-btn ${currentCategoryFilter === c ? 'active' : ''}" onclick="window.filterProds('${c}')">${c}</button>`);
    container.innerHTML = html;
}

window.filterProds = function(cat) { currentCategoryFilter = cat; renderProdTabs(); window.renderProdsTable(); }

window.renderProdsTable = function() {
    const searchTerm = document.getElementById('search-prod').value.toLowerCase();
    const tb = document.querySelector("#tbl-produtos tbody"); tb.innerHTML = "";
    
    let filtered = searchTerm ? allProducts.filter(p => `${p.nome} ${p.categoria} ${p.tamanho||''} ${p.min||1} ${p.preco} ${p.descricaoItem||''} ${p.descricaoResumo||''} ${p.descricaoPopup||''} ${p.ativo?'visível':'oculto'}`.toLowerCase().includes(searchTerm)) : allProducts.filter(p => (p.categoria || 'Sem Categoria') === currentCategoryFilter);
    let chaveAtual = null;

    // EMPTY STATE DA TABELA AQUI!
    if (filtered.length === 0) {
        tb.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 50px 20px; color: #999; font-family: var(--font-numbers); font-size: 1.1rem;"><i class="fas fa-box-open" style="font-size:3rem; margin-bottom:15px; display:block; color:#ddd;"></i>Nenhum produto encontrado por aqui.</td></tr>`;
        return;
    }
    
    filtered.sort(sortProducts).forEach((p) => {
        const imgTag = p.imagemUrl ? `<img src="${p.imagemUrl}" class="img-preview">` : `<div class="img-preview" style="background:#eee; display:flex; align-items:center; justify-content:center;"><i class="fas fa-image" style="color:#ccc;"></i></div>`;
        const isNewGroup = p.nome !== chaveAtual; if(isNewGroup) chaveAtual = p.nome;

        tb.innerHTML += `<tr class="${isNewGroup ? 'group-separator-top' : ''}">
            <td data-label="Sel:" style="text-align: center;"><input type="checkbox" class="bulk-checkbox row-checkbox" value="${p.id}" onchange="window.checkSelection('produtos')"></td>
            <td data-label="Foto:">${imgTag}</td><td data-label="Nome:"><strong style="color:var(--favu-rust); font-size:1.1rem;">${p.nome}</strong></td>
            <td data-label="Categoria:">${p.categoria}</td><td data-label="Tam:">${p.tamanho||'-'}</td><td data-label="Mín:">${p.min||1}</td>
            <td data-label="Preço:">R$ ${(Number(p.preco) || 0).toFixed(2)}</td><td data-label="Desc. Produto:"><small>${p.descricaoItem ? window.formatText(p.descricaoItem) : '-'}</small></td>
            <td data-label="Desc. Resumo:"><small>${p.descricaoResumo ? window.formatText(p.descricaoResumo) : '-'}</small></td><td data-label="Desc. Imagem:"><small>${p.descricaoPopup ? window.formatText(p.descricaoPopup) : '-'}</small></td>
            <td data-label="Status:"><span class="badge ${p.ativo?'ativo':'inativo'}">${p.ativo?'Visível':'Oculto'}</span></td>
            <td data-label="Ações:">
                <div class="action-btns-wrapper">
                    <button class="btn-action edit" onclick="window.openEditor('${p.id}')"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-action toggle" onclick="window.togP('${p.id}', ${!p.ativo})"><i class="fas fa-${p.ativo?'eye':'eye-slash'}"></i></button>
                    <button class="btn-action del" onclick="window.delP('${p.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });
}

document.getElementById('form-add-prod').onsubmit = async(e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
    try {
        let url = ""; const f = document.getElementById('a-file').files[0]; if(f) url = await upImg(f);
        const nomeBase = document.getElementById('a-nome').value.trim();
        const categoriaBase = document.getElementById('a-cat').value;
        const descMenuBase = document.getElementById('a-dmenu').value.trim();
        const descPopupBase = document.getElementById('a-dpop').value.trim();
        
        // Agora lê a Descrição do Resumo do novo campo que colocamos lá em cima
        const descResumoBase = document.getElementById('a-dres').value.trim(); 

        for(let v of document.querySelectorAll('.variation-block')) {
            // Agora lê o Mínimo de dentro do próprio bloco de variação (lado a lado com o tamanho)
            const minInput = v.querySelector('.v-min');
            const minVariation = minInput && minInput.value ? parseInt(minInput.value) : 1; 
            
            await addDoc(collection(db, "produtos"), {
                nome: nomeBase, categoria: categoriaBase, min: minVariation, 
                descricaoItem: descMenuBase, descricaoPopup: descPopupBase, 
                imagemUrl: url, ativo: true, tamanho: v.querySelector('.v-tam').value.trim(), 
                preco: parseFloat(v.querySelector('.v-preco').value)||0, descricaoResumo: descResumoBase
            });
        }
        customAlert("Item(ns) Adicionado(s)!"); window.closeModal('modal-add-prod', 'form-add-prod'); loadProds();
    } catch(err) { console.error(err); customAlert("Erro ao salvar.", "Erro"); } finally { btn.innerHTML = 'Salvar Novo Produto'; btn.disabled = false; }
};


window.openEditor = async function(id) {
    try {
        const snap = await getDoc(doc(db, "produtos", id));
        if (!snap.exists()) {
            customAlert("Produto não encontrado.", "Erro");
            return;
        }

        const p = snap.data();
        const catSelect = document.getElementById('e-cat');

        // Garante que a categoria do produto exista no select, mesmo se a lista ainda não tiver sincronizado.
        if (p.categoria && catSelect && !Array.from(catSelect.options).some(opt => opt.value === p.categoria)) {
            const opt = document.createElement('option');
            opt.value = p.categoria;
            opt.textContent = p.categoria;
            catSelect.appendChild(opt);
        }

        document.getElementById('e-id').value = id;
        document.getElementById('e-nome').value = p.nome || '';
        document.getElementById('e-cat').value = p.categoria || '';
        document.getElementById('e-tam').value = p.tamanho || '';
        document.getElementById('e-min').value = p.min || 1;
        document.getElementById('e-preco').value = Number(p.preco) || 0;
        document.getElementById('e-dmenu').value = p.descricaoItem || '';
        document.getElementById('e-dres').value = p.descricaoResumo || '';
        document.getElementById('e-dpop').value = p.descricaoPopup || '';

        document.getElementById('e-file').value = '';
        document.getElementById('e-file-name').textContent = '';
        document.getElementById('e-remove-img').value = 'false';

        if (p.imagemUrl) {
            document.getElementById('e-img-preview').src = p.imagemUrl;
            document.getElementById('e-img-preview').style.display = 'block';
            document.getElementById('btn-remove-e-img').style.display = 'inline-flex';
            document.getElementById('e-img-none').style.display = 'none';
        } else {
            document.getElementById('e-img-preview').src = '';
            document.getElementById('e-img-preview').style.display = 'none';
            document.getElementById('btn-remove-e-img').style.display = 'none';
            document.getElementById('e-img-none').style.display = 'block';
        }

        document.getElementById('e-cat').dispatchEvent(new Event('change'));
        window.openModal('modal-editar-prod');
    } catch (err) {
        console.error("Erro ao abrir edição do produto:", err);
        customAlert("Erro ao abrir edição do produto. Veja o Console para detalhes.", "Erro");
    }
};
window.openEditProd = window.openEditor;

document.getElementById('e-cat').addEventListener('change', function() {
    const catObj = globalCategories.find(c => c.nome === this.value);
    const showTam = catObj && (catObj.tipoColuna === 'Tamanho' || catObj.tipoColuna === 'Tamanho/Minimo');
    
    document.getElementById('e-tam-container').style.display = showTam ? 'block' : 'none';
    if(document.getElementById('e-tam')) {
        document.getElementById('e-tam').required = (catObj && catObj.tipoColuna === 'Tamanho');
    }
});

document.getElementById('form-edit-prod').onsubmit = async(e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
    try {
        const data = { nome: document.getElementById('e-nome').value, categoria: document.getElementById('e-cat').value, tamanho: document.getElementById('e-tam').value, preco: parseFloat(document.getElementById('e-preco').value)||0, min: parseInt(document.getElementById('e-min').value)||1, descricaoItem: document.getElementById('e-dmenu').value, descricaoResumo: document.getElementById('e-dres').value, descricaoPopup: document.getElementById('e-dpop').value };
        const f = document.getElementById('e-file').files[0]; if (f) data.imagemUrl = await upImg(f); else if (document.getElementById('e-remove-img').value === 'true') data.imagemUrl = ""; 
        await updateDoc(doc(db, "produtos", document.getElementById('e-id').value), data); customAlert("Produto Atualizado!"); window.closeModal('modal-editar-prod', 'form-edit-prod'); loadProds(); 
    } catch(err) { console.error('Erro ao salvar produto:', err); customAlert('Erro ao salvar produto. Veja o Console para detalhes.', 'Erro'); } finally { btn.innerHTML = 'Salvar Alterações'; btn.disabled = false; }
};

window.togP = async(id, s) => { 
    await updateDoc(doc(db, "produtos", id), {ativo:s}); 
    const index = allProducts.findIndex(p => p.id === id);
    if(index > -1) allProducts[index].ativo = s;
    window.renderProdsTable(); 
};

window.delP = async(id) => { 
    customConfirm("Excluir item?", async () => { 
        await deleteDoc(doc(db, "produtos", id)); 
        allProducts = allProducts.filter(p => p.id !== id);
        window.renderProdsTable(); 
        window.renderOrcamentoMenu();
    }); 
};

document.getElementById('search-aviso').addEventListener('input', () => { window.renderAvisosTable(); });
window.limparFiltroComunicados = function() {
    const campo = document.getElementById('search-aviso');
    if (campo) campo.value = '';
    window.renderAvisosTable();
};
document.getElementById('form-add-aviso').onsubmit = async(e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    btn.disabled = true;
    try {
        let url = "";
        const f = document.getElementById('aa-file').files[0];
        if(f) url = await upImg(f);
        const ordem = Date.now();
        await addDoc(collection(db, "avisos"), {
            titulo: (document.getElementById('aa-tit').value || '').trim(),
            texto: window.getAvisoRichText('aa'),
            ...getAvisoScheduleFromForm('aa'),
            imagemUrl: url,
            posicaoImagem: document.getElementById('aa-img-pos').value || 'top',
            ativo: true,
            ordem
        });
        customAlert("Comunicado criado!");
        window.closeModal('modal-add-aviso', 'form-add-aviso');
        window.setAvisoRichText('aa', '');
        window.setAvisoImagePosition('aa', 'top');
        loadAvisos();
    } catch(err) {
        console.error(err);
        customAlert("Erro ao criar comunicado.", "Erro");
    } finally {
        btn.innerHTML = 'Criar Comunicado';
        btn.disabled = false;
    }
};

async function loadAvisos() {
    const s = await getDocs(collection(db, "avisos"));
    allAvisos = [];
    s.forEach(d => allAvisos.push({id: d.id, ...d.data()}));
    window.renderAvisosTable();
}

window.renderAvisosTable = function() {
    const tb = document.querySelector("#tbl-avisos tbody");
    tb.innerHTML = "";
    const searchTerm = document.getElementById('search-aviso').value.toLowerCase();
    const lista = orderedAvisosList()
        .filter(a => getAvisoStatus(a).grupo === currentAvisosTab)
        .filter(a => `${a.titulo || ''} ${stripCatNotice(a.texto || '')}`.toLowerCase().includes(searchTerm));

    if (lista.length === 0) {
        tb.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 45px 20px; color:#999; font-family: var(--font-numbers);">Nenhum comunicado encontrado.</td></tr>`;
        return;
    }

    lista.forEach(a => {
        const isAtivo = a.ativo !== false;
        const status = getAvisoStatus(a);
        const textoHtml = sanitizeRichText(a.texto || '');
        const textoPlain = stripCatNotice(a.texto || '') || '-';
        const imgPos = a.posicaoImagem || 'top';
        const imgHtml = a.imagemUrl ? renderClickableAvisoImage(a.imagemUrl, 'img-preview') : '-';

        tb.innerHTML += `<tr class="aviso-row" data-aviso-id="${a.id}">
            <td class="aviso-select-cell" data-label="Selecionar:" style="text-align:center;"><input type="checkbox" class="bulk-checkbox row-checkbox" value="${a.id}" onchange="window.checkSelection('avisos')"></td>
            <td class="aviso-image-cell" data-label="Imagem:">${imgHtml}</td>
            <td class="aviso-title-cell" data-label="Título:"><strong>${escapeHTML(a.titulo || '-')}</strong></td>
            <td class="aviso-message-cell" data-label="Mensagem:"><small class="aviso-message-summary" title="${escapeHTML(textoPlain)}">${textoHtml || '-'}</small></td>
            <td class="aviso-mobile-preview-cell" data-label="">${buildAvisoMobilePreview(a)}</td>
            <td class="aviso-period-cell desktop-schedule-cell" data-label="Programação:">${renderAvisoScheduleHtml(a)}</td>
            <td class="aviso-mobile-start mobile-schedule-cell" data-label="Início:">${getAvisoScheduleValue(a.inicio)}</td>
            <td class="aviso-mobile-end mobile-schedule-cell" data-label="Fim:">${getAvisoScheduleValue(a.fim)}</td>
            <td class="aviso-status-cell" data-label="Status:"><span class="badge ${status.stClass}">${status.st}</span></td>
            <td class="aviso-actions-cell" data-label="Ações:">
                <div class="action-btns-wrapper">
                    <button class="btn-action edit" onclick="window.openEditAviso('${a.id}')"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-action copy" title="Copiar comunicado" onclick="window.copyAviso('${a.id}')"><i class="fas fa-copy"></i></button>
                    <button class="btn-action toggle ${isAtivo ? 'cat-toggle-visible' : 'cat-toggle-hidden'}" onclick="window.togA('${a.id}', ${!isAtivo})"><i class="fas fa-${isAtivo?'eye':'eye-slash'}"></i></button>
                    <button class="btn-action del" onclick="window.delDoc('avisos','${a.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });
}

window.openEditAviso = async(id) => {
    const a = (await getDoc(doc(db,"avisos",id))).data();
    document.getElementById('ea-id').value = id;
    document.getElementById('ea-tit').value = a.titulo || '';
    window.setAvisoRichText('ea', a.texto || '');
    window.setAvisoImagePosition('ea', a.posicaoImagem || 'top');
    setAvisoScheduleFields('ea', a.inicio, a.fim);
    if (a.imagemUrl) {
        document.getElementById('ea-img-preview').src = a.imagemUrl;
        document.getElementById('ea-img-preview').style.display = 'block';
        document.getElementById('btn-remove-ea-img').style.display = 'inline-block';
        document.getElementById('ea-img-none').style.display = 'none';
    } else {
        document.getElementById('ea-img-preview').style.display = 'none';
        document.getElementById('btn-remove-ea-img').style.display = 'none';
        document.getElementById('ea-img-none').style.display = 'block';
    }
    document.getElementById('ea-remove-img').value = 'false';
    window.openModal('modal-editar-aviso');
};

document.getElementById('form-edit-aviso').onsubmit = async(e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;
    try {
        let data = {
            titulo: (document.getElementById('ea-tit').value || '').trim(),
            texto: window.getAvisoRichText('ea'),
            ...getAvisoScheduleFromForm('ea'),
            posicaoImagem: document.getElementById('ea-img-pos').value || 'top'
        };
        const f = document.getElementById('ea-file').files[0];
        if (f) data.imagemUrl = await upImg(f);
        else if (document.getElementById('ea-remove-img').value === 'true') data.imagemUrl = "";
        await updateDoc(doc(db, "avisos", document.getElementById('ea-id').value), data);
        customAlert("Comunicado atualizado!");
        window.closeModal('modal-editar-aviso', 'form-edit-aviso');
        loadAvisos();
    } catch(e) {
        console.error(e);
        customAlert("Erro ao salvar comunicado.", "Erro");
    } finally {
        btn.innerHTML = 'Salvar Alterações';
        btn.disabled = false;
    }
};

window.copyAviso = async function(id) {
    try {
        const ordered = orderedAvisosList();
        const index = ordered.findIndex(a => a.id === id);
        const source = ordered[index] || allAvisos.find(a => a.id === id);
        if (!source) return;

        const copyData = { ...source };
        delete copyData.id;
        copyData.titulo = `${source.titulo || 'Comunicado'} (Cópia)`;
        copyData.createdAt = Date.now();
        copyData.updatedAt = Date.now();

        const newRef = await addDoc(collection(db, "avisos"), copyData);
        const ids = ordered.map(a => a.id);
        ids.splice(index + 1, 0, newRef.id);
        await Promise.all(ids.map((avisoId, pos) => updateDoc(doc(db, "avisos", avisoId), { ordem: pos })));
        customAlert("Comunicado copiado!");
        loadAvisos();
    } catch(err) {
        console.error('Erro ao copiar comunicado:', err);
        customAlert('Não foi possível copiar o comunicado.', 'Atenção');
    }
};

window.togA = async(id, s) => {
    await updateDoc(doc(db, "avisos", id), {ativo: s});
    loadAvisos();
};

let currentOrcCatFilter = '';
let orcQtdState = {};
window.orcCupomAplicado = null;

window.getOrcQtd = function(id) { return orcQtdState[id] || 0; };
window.inputQtdOrcamento = function(input, itemId) { let val = parseInt(input.value); if(isNaN(val) || val < 0) val = 0; orcQtdState[itemId] = val; window.calcOrcamentoTotal(); };

function formatarTamanhoOrcamento(valor) {
    let texto = window.formatText((valor || '-').toString().trim());
    if (texto.includes(' (')) {
        texto = texto.replace(/\s+\(([^)]+)\)/, function(_, peso) {
            return ` <span class="peso-mobile">(${peso.toLowerCase()})</span>`;
        });
    }
    return texto;
}

window.limparFiltroOrcamento = function() {
    const campo = document.getElementById('search-orcamento');
    if (campo) campo.value = '';
    window.renderOrcamentoMenu();
};

window.renderOrcamentoMenu = function() {
    const container = document.getElementById('orc-menu-container'); 
    const nav = document.getElementById('orc-cats-nav');
    container.innerHTML = ""; nav.innerHTML = "";
    
    // No orçamento do Admin, as categorias ficam disponíveis mesmo se estiverem ocultas/agendadas para o site de clientes.
    const termoBuscaOrcamento = (document.getElementById('search-orcamento')?.value || '').trim().toLowerCase();
    const normalizarBuscaOrcamento = (valor) => (valor || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const termoNormalizado = normalizarBuscaOrcamento(termoBuscaOrcamento);
    
    const orcAgrupados = {}; 
    allProducts
        .filter(p => p.ativo)
        .filter(p => {
            if (!termoNormalizado) return true;
            return [p.nome, p.categoria, p.tamanho, p.descricaoItem, p.descricaoResumo, p.descricaoPopup]
                .some(valor => normalizarBuscaOrcamento(valor).includes(termoNormalizado));
        })
        .forEach(p => { 
            const cat = p.categoria || 'Geral'; 
            if(!orcAgrupados[cat]) orcAgrupados[cat] = []; 
            orcAgrupados[cat].push(p); 
        });
    
    const categoriasOrdenadas = Object.keys(orcAgrupados).sort(window.sortAlfabetico);
    if(categoriasOrdenadas.length > 0 && (!currentOrcCatFilter || !categoriasOrdenadas.includes(currentOrcCatFilter))) currentOrcCatFilter = categoriasOrdenadas[0];
    
    categoriasOrdenadas.forEach(c => {
        const idGrupo = `orc-grupo-${c.toLowerCase().replace(/\s/g, '-')}`;
        nav.innerHTML += `<a href="#${idGrupo}" class="categoria-btn-orc ${currentOrcCatFilter === c ? 'active-link' : ''}" data-target="${idGrupo}" onclick="event.preventDefault(); window.filterOrc('${c}')">${c}</a>`;
    });

    // Construtor inteligente de tabelas para manter o visual limpo
    const gerarTabelaHtml = (listaItens, tipoColuna) => {
        if(listaItens.length === 0) return '';
        
        let labelDesktop = tipoColuna === 'Mínimo' ? 'Mínimo' : 'Tamanho';
        let labelMobile = tipoColuna === 'Mínimo' ? 'MÍN.' : 'TAM.';
        
        let thSecundaria = (tipoColuna && tipoColuna !== 'Nenhuma') ? `<th class="col-sec"><span class="th-mobile">${labelMobile}</span><span class="th-desktop">${labelDesktop}</span></th>` : '';
        let t = `<div class="table-card-orc table-card" style="margin-bottom: 20px;"><table class="orc-table"><caption>${tipoColuna || 'Itens'}</caption><thead><tr><th class="col-item">ITEM</th><th class="col-icon"></th>${thSecundaria}<th class="col-unid"><span class="th-mobile">UNID.</span><span class="th-desktop">Unidade</span></th><th class="col-qtd"><span class="th-mobile">QTD</span><span class="th-desktop">Quantidade</span></th></tr></thead><tbody>`;

        let chaveAtual = null; 
        const agruparPorNome = (tipoColuna === 'Tamanho'); 
        const contagemNomes = {};
        if(agruparPorNome) listaItens.forEach(i => { const chave = `${(i.nome || 'Sem Nome').trim().toLowerCase()}|||${(i.descricaoItem || '').trim().toLowerCase()}`; contagemNomes[chave] = (contagemNomes[chave] || 0) + 1; });

        listaItens.forEach((p, index) => {
            const inputHtml = `<div class="quantidade-input-group"><button type="button" class="qtd-btn-table" onclick="window.alterarQtdOrcamento('${p.id}', -1)">-</button><input type="number" value="${window.getOrcQtd(p.id)}" oninput="window.inputQtdOrcamento(this, '${p.id}')" class="quantidade-input orc-qtd-input" data-item-id="${p.id}"><button type="button" class="qtd-btn-table" onclick="window.alterarQtdOrcamento('${p.id}', 1)">+</button></div>`;
            const iconeHint = p.imagemUrl ? `<i class="fas fa-camera foto-hint"></i>` : (p.descricaoPopup ? `<i class="fas fa-info-circle foto-hint"></i>` : '');
            const celulaNomeHTML = `<div class="item-nome-texto" style="line-height: 1.2;">${window.formatText((p.nome || 'Sem Nome').trim())}</div>${p.descricaoItem ? `<div class="descricao descricao-orc" style="text-align: left;">${window.formatText(p.descricaoItem)}</div>` : ''}`;
            
            // Mantém a mesma apresentação do Cardápio: tamanho em duas linhas quando houver peso, ex.: P / (1 kg).
            let conteudoSecundario = tipoColuna === 'Mínimo' ? (p.min || 1) : formatarTamanhoOrcamento(p.tamanho || '-');
            let tdSec = (tipoColuna && tipoColuna !== 'Nenhuma') ? `<td class="col-sec">${conteudoSecundario}</td>` : '';
            
            const precoNumero = Number(p.preco) || 0;
            const celulasRestantes = `${tdSec}<td class="col-unid"><span class="moeda">R$</span> <span class="valor">${precoNumero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td><td class="col-qtd"><div class="quantidade-container">${inputHtml}</div></td>`;
            
            if(agruparPorNome) {
                const chaveAgrupamento = `${(p.nome || 'Sem Nome').trim().toLowerCase()}|||${(p.descricaoItem || '').trim().toLowerCase()}`;
                const proximoItem = listaItens[index + 1];
                const proximaChave = proximoItem ? `${(proximoItem.nome || 'Sem Nome').trim().toLowerCase()}|||${(proximoItem.descricaoItem || '').trim().toLowerCase()}` : null;
                const classeSeparador = (!proximaChave || proximaChave !== chaveAgrupamento) ? ' class="group-separator"' : '';

                if(chaveAgrupamento !== chaveAtual) { 
                    chaveAtual = chaveAgrupamento; 
                    t += `<tr${classeSeparador}><td rowspan="${contagemNomes[chaveAtual]}" class="item-group-cell col-item">${celulaNomeHTML}</td><td rowspan="${contagemNomes[chaveAtual]}" class="item-group-cell col-icon">${iconeHint}</td>${celulasRestantes}</tr>`; 
                } else {
                    t += `<tr${classeSeparador}><td style="display:none;"></td><td style="display:none;"></td>${celulasRestantes}</tr>`;
                }
            } else { 
                t += `<tr class="group-separator"><td class="col-item">${celulaNomeHTML}</td><td class="col-icon">${iconeHint}</td>${celulasRestantes}</tr>`; 
            }
        });
        return t + `</tbody></table></div>`;
    };

    categoriasOrdenadas.filter(c=>c===currentOrcCatFilter).forEach(nomeCat => {
        const catObj = globalCategories.find(c => c.nome === nomeCat) || { tipoColuna: 'Tamanho' };
        const itens = orcAgrupados[nomeCat].sort(sortProducts);

        let htmlFull = `<div class="categoria-group-orc active-group" id="orc-grupo-${nomeCat.toLowerCase().replace(/\s/g, '-')}"><h2 class="categoria-title-orc">${nomeCat}</h2>`;
        
        // Se a categoria for Tamanho/Minimo, segrega e gera dois grupos
        if (catObj.tipoColuna === 'Tamanho/Minimo') {
            const itensTam = itens.filter(i => i.tamanho && i.tamanho.trim() !== '');
            const itensMin = itens.filter(i => !i.tamanho || i.tamanho.trim() === '');
            
            if(itensTam.length > 0) {
                htmlFull += gerarTabelaHtml(itensTam, 'Tamanho');
            }
            if(itensMin.length > 0) {
                htmlFull += gerarTabelaHtml(itensMin, 'Mínimo');
            }
        } else {
            // Se for apenas uma coisa ou outra, segue normal
            htmlFull += gerarTabelaHtml(itens, catObj.tipoColuna);
        }
        
        htmlFull += `</div>`; 
        container.innerHTML += htmlFull;
    });

    window.calcOrcamentoTotal(); 
    configurarEventosDragOrcamento();
};

window.filterOrc = function(cat) { currentOrcCatFilter = cat; window.renderOrcamentoMenu(); };
window.alterarQtdOrcamento = function(itemId, delta) { let val = (orcQtdState[itemId] || 0) + delta; if(val < 0) val = 0; orcQtdState[itemId] = val; const input = document.querySelector(`.orc-qtd-input[data-item-id="${itemId}"]`); if(input) input.value = val; window.calcOrcamentoTotal(); };
window.removerItemOrcamento = function(itemId) { orcQtdState[itemId] = 0; window.renderOrcamentoMenu(); window.calcOrcamentoTotal(); };

window.calcOrcamentoTotal = function() {
    let bruto = 0, totalItens = 0;
    const resumoItensPopup = document.getElementById("popup-resumo-itens-orc");
    if (resumoItensPopup) resumoItensPopup.innerHTML = '';

    const gruposResumo = {};
    allProducts.forEach(p => {
        const q = orcQtdState[p.id] || 0;
        const preco = converterValorParaNumero(p.preco);
        if (q > 0) {
            bruto += (q * preco);
            totalItens += q;
            const cat = p.categoria || 'Geral';
            if (!gruposResumo[cat]) gruposResumo[cat] = [];
            gruposResumo[cat].push({ q, p: preco, desc: p.descricaoResumo || p.nome, id: p.id });
        }
    });

    const descManual = Math.max(0, converterValorParaNumero(document.getElementById('orc-desconto')?.value || 0));
    const descCupom = window.orcCupomAplicado?.desconto || 0;
    const liq = Math.max(0, bruto - descCupom - descManual);

    if (document.getElementById('orc-bruto-txt')) document.getElementById('orc-bruto-txt').textContent = bruto.toLocaleString('pt-BR', {minimumFractionDigits: 2});
    if (document.getElementById('orc-liquido-txt')) document.getElementById('orc-liquido-txt').textContent = liq.toLocaleString('pt-BR', {minimumFractionDigits: 2});

    const btnSummary = document.getElementById('fixed-summary-orc');
    if (bruto > 0) {
        if (btnSummary) {
            btnSummary.style.display = 'block';
            document.getElementById('summary-total-orc').textContent = `R$ ${liq.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
            document.getElementById('summary-item-count-orc').textContent = `/ ${totalItens} itens`;
        }
        if (resumoItensPopup) {
            for (const grupo in gruposResumo) {
                resumoItensPopup.innerHTML += `<div class="resumo-grupo-titulo">${grupo}:</div>`;
                gruposResumo[grupo].forEach(item => {
                    const descricaoItemPopupFormatada = window.formatText(item.desc);
                    resumoItensPopup.innerHTML += `<div class="resumo-item-line"><div class="resumo-item-name">${descricaoItemPopupFormatada} <small>R$ ${(item.q * item.p).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</small></div><div style="display: flex; flex-direction: column; align-items: center; gap: 4px;"><div style="display: flex; align-items: center; gap: 8px;"><div class="resumo-item-input-group"><button type="button" class="resumo-qtd-btn" onclick="window.alterarQtdOrcamento('${item.id}', -1)">-</button><input type="number" value="${item.q}" oninput="window.inputQtdOrcamento(this, '${item.id}')"><button type="button" class="resumo-qtd-btn" onclick="window.alterarQtdOrcamento('${item.id}', 1)">+</button></div><button type="button" class="btn-excluir" onclick="window.removerItemOrcamento('${item.id}')"><i class="fas fa-trash"></i></button></div></div></div>`;
                });
            }

            if (window.orcCupomAplicado?.codigo || descManual > 0) {
                resumoItensPopup.innerHTML += `<div class="resumo-grupo-titulo">Descontos:</div>`;
                if (window.orcCupomAplicado?.codigo) resumoItensPopup.innerHTML += `<div class="resumo-item-line"><div class="resumo-item-name">Cupom: ${window.orcCupomAplicado.codigo}</div></div>`;
                if ((descCupom + descManual) > 0) resumoItensPopup.innerHTML += `<div class="resumo-item-line"><div class="resumo-item-name">Desconto: -R$ ${formatarNumeroMoedaPedido(descCupom + descManual)}</div></div>`;
            }
        }
    } else {
        if (btnSummary) btnSummary.style.display = 'none';
        const modal = document.getElementById('modal-orcamento-pedido');
        if (modal) { modal.classList.remove('show'); setTimeout(() => { modal.style.display = 'none'; }, 300); }
    }
};

window.abrirModalOrcamento = function() { window.openModal('modal-orcamento-pedido'); };

window.resetarCupomOrcamento = function() {
    window.orcCupomAplicado = null;
    const status = document.getElementById('orc-cupom-status');
    if (status) { status.textContent = ''; status.className = 'edit-cupom-status'; }
    window.calcOrcamentoTotal();
};

window.validarCupomOrcamento = async function() {
    const input = document.getElementById('orc-cupom');
    const status = document.getElementById('orc-cupom-status');
    const codigo = (input?.value || '').trim().toUpperCase();

    let subtotal = 0;
    allProducts.forEach(p => {
        const q = orcQtdState[p.id] || 0;
        if (q > 0) subtotal += q * converterValorParaNumero(p.preco);
    });

    window.orcCupomAplicado = null;
    if (status) { status.textContent = ''; status.className = 'edit-cupom-status'; }

    try {
        const resultado = await validarCupomAdmin(codigo, subtotal);
        if (!resultado.ok) {
            if (status) { status.textContent = resultado.motivo; status.className = 'edit-cupom-status erro'; }
            window.calcOrcamentoTotal();
            return;
        }

        window.orcCupomAplicado = { codigo: resultado.codigo, desconto: resultado.desconto };
        if (input) input.value = resultado.codigo;
        if (status) { status.textContent = `Cupom aplicado: -R$ ${formatarNumeroMoedaPedido(resultado.desconto)}`; status.className = 'edit-cupom-status ok'; }
        window.calcOrcamentoTotal();
    } catch (err) {
        console.error(err);
        if (status) { status.textContent = 'Erro ao validar cupom.'; status.className = 'edit-cupom-status erro'; }
        window.calcOrcamentoTotal();
    }
};

window.avancarDadosCliente = function() { document.getElementById('modal-orcamento-pedido').classList.remove('show'); setTimeout(() => { document.getElementById('modal-orcamento-pedido').style.display = 'none'; window.openModal('modal-orcamento-cliente'); }, 300); };
window.voltarResumoOrcamento = function() { document.getElementById('modal-orcamento-cliente').classList.remove('show'); setTimeout(() => { document.getElementById('modal-orcamento-cliente').style.display = 'none'; window.openModal('modal-orcamento-pedido'); }, 300); };
window.buscarContato = async function() {
    const nomeInput = document.getElementById('orc-nome');
    const telInput = document.getElementById('orc-tel');

    const focarTelefone = () => {
        if (telInput) {
            telInput.focus();
            try { telInput.click(); } catch (e) {}
        }
        window.showToast("Preencha o número do cliente.");
    };

    if ('contacts' in navigator && 'ContactsManager' in window && navigator.contacts?.select) {
        try {
            const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
            if (contacts.length > 0) {
                if (contacts[0].name && nomeInput) nomeInput.value = contacts[0].name[0];
                if (contacts[0].tel && telInput) telInput.value = contacts[0].tel[0].replace(/\D/g, '');
                return;
            }
        } catch (err) {
            console.warn("Busca automática de contato indisponível/cancelada:", err);
        }
    }

    focarTelefone();
};

window.gerarOrcamentoWA = async function() {
    let temItens = false; const groups = {}; let bruto = 0;
    allProducts.forEach(p => {
        const q = orcQtdState[p.id] || 0;
        if (q > 0) {
            temItens = true;
            const cat = p.categoria || 'Geral';
            const preco = converterValorParaNumero(p.preco);
            bruto += (q * preco);
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ q, p: preco, desc: p.descricaoResumo || p.nome });
        }
    });

    if (!temItens) return customAlert("Adicione itens ao orçamento.");

    const nm = document.getElementById('orc-nome').value.trim().toUpperCase(),
        tel = document.getElementById('orc-tel').value.trim(),
        dt = document.getElementById('orc-data').value,
        hrInput = document.getElementById('orc-hora'),
        hr = normalizarHoraPedidoManual(hrInput?.value || ''),
        pag = normalizarFormaPagamentoPedido(document.getElementById('orc-pag').value),
        modalidadeCreditoOrcamento = getModalidadeCreditoPedido({ Forma_de_Pagamento: pag }),
        obs = document.getElementById('orc-obs').value.trim();

    if (hrInput && hr) hrInput.value = hr;
    if (!nm || !dt || !hr || !pag || !tel) return customAlert("Preencha todos os dados.");

    const descManual = Math.max(0, converterValorParaNumero(document.getElementById('orc-desconto')?.value || 0));
    const descCupom = window.orcCupomAplicado?.desconto || 0;
    const desc = descManual + descCupom;
    const liq = Math.max(0, bruto - desc);
    const cupomOrcamento = (window.orcCupomAplicado?.codigo || '').trim().toUpperCase();

    const formatarMoedaOrc = (valor) => Number(valor || 0).toFixed(2).replace('.', ',');
    const descontoLinha = desc > 0 ? `Desconto: -R$${formatarMoedaOrc(desc)}\n` : '';
    const cupomLinha = cupomOrcamento ? `Cupom: ${cupomOrcamento}\n` : '';

    let txt = `Segue o resumo do orçamento do seu pedido!\n\n*_- Resumo do pedido_:*\n\n`, resumoTextoFirestore = '';

    for (const cat in groups) {
        txt += `*${cat}:*\n`;
        resumoTextoFirestore += `- ${cat}:\n`;

        groups[cat].forEach(i => {
            const tot = i.p * i.q;
            txt += `${i.desc} - ${i.q} un. (R$ ${formatarMoedaOrc(i.p)} cada) = R$ ${formatarMoedaOrc(tot)}\n`;
            resumoTextoFirestore += `${i.q} un. - ${i.desc} (R$ ${formatarMoedaOrc(i.p)}) = R$ ${formatarMoedaOrc(tot)}\n`;
        });

        txt += `\n`;
    }

    txt += `Valor dos Itens: R$ ${formatarMoedaOrc(bruto)}\n`;
    if (cupomLinha || descontoLinha) {
        txt += `${cupomLinha}${descontoLinha}`;
    }

    const dateFormatted = `${dt.split('-')[2]}/${dt.split('-')[1]}/${dt.split('-')[0]}`;
    txt += `Valor Final: R$ ${formatarMoedaOrc(liq)}\n\n`;
    txt += `*- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -*\n\n`;
    txt += `_*- Informações do pedido:*_\n\n*Nome*: ${nm}\n*Data*: ${dateFormatted}\n*Horário*: ${hr}\n*Forma de Pagamento*: ${formatarPagamentoPedidoTexto(pag, modalidadeCreditoOrcamento)}`;

    if (obs) txt += `\n*Observações*: ${obs}`;

    const cupomFirestore = [
        cupomOrcamento ? `Cupom: ${cupomOrcamento}` : '',
        desc > 0 ? `Desconto: -R$${formatarMoedaOrc(desc)}` : ''
    ].filter(Boolean).join(' | ');

    const orderId = 'ORC-' + Date.now().toString();
    const dadosPedido = {
        ID_do_Pedido: orderId,
        origem: 'orcamento',
        Status_do_Pedido: 'Pedidos Orçados',
        Nome_Cliente: nm,
        Numero: tel,
        Data_Entrega: dateFormatted,
        Horario_Entrega: hr,
        Total_Final: formatarMoedaOrc(liq),
        Forma_de_Pagamento: pag,
        Modalidade_Credito: modalidadeCreditoOrcamento,
        ...montarDadosTaxaPagamento({ Forma_de_Pagamento: pag, Modalidade_Credito: modalidadeCreditoOrcamento, Total_Final: formatarMoedaOrc(liq) }),
        Status_Pagamento: 'Pendente',
        Cupom: cupomFirestore,
        Observacoes: obs,
        Resumo_dos_Itens: resumoTextoFirestore.trim(),
        createdAt: Date.now()
    };

    let cleanTel = tel.replace(/\D/g, '');
    if (cleanTel.length >= 10 && !cleanTel.startsWith('55')) cleanTel = '55' + cleanTel;

    const whatsappUrl = `https://wa.me/${cleanTel}?text=${encodeURIComponent(txt)}`;

    const salvamentoPedido = setDoc(doc(db, "pedidos", orderId), dadosPedido)
        .then(async () => { if (cupomOrcamento) await registrarUsoCupom(cupomOrcamento); window.showToast("Orçamento salvo como Pedido!"); })
        .catch((e) => {
            console.error("Erro ao salvar orçamento:", e);
            window.showToast("Resumo aberto no WhatsApp, mas houve erro ao salvar o orçamento.", true);
        });

    const janelaWhatsApp = window.open(whatsappUrl, '_blank');
    if (!janelaWhatsApp) window.location.href = whatsappUrl;

    await salvamentoPedido;

    orcQtdState = {};
    document.getElementById('form-pedido-orc').reset();
    document.getElementById('orc-desconto').value = '0';
    const orcCupomInput = document.getElementById('orc-cupom'); if (orcCupomInput) orcCupomInput.value = '';
    window.orcCupomAplicado = null;
    const orcCupomStatus = document.getElementById('orc-cupom-status'); if (orcCupomStatus) { orcCupomStatus.textContent = ''; orcCupomStatus.className = 'edit-cupom-status'; }
    window.renderOrcamentoMenu();
    document.getElementById('modal-orcamento-cliente').classList.remove('show');
    setTimeout(() => { document.getElementById('modal-orcamento-cliente').style.display = 'none'; }, 300);
};

function configurarEventosDragOrcamento() {
    const nav = document.getElementById('orc-cats-nav'); if(!nav) return;
    let isDown = false, startX, scrollLeft;
    nav.addEventListener('mousedown', (e) => { isDown = true; startX = e.pageX - nav.offsetLeft; scrollLeft = nav.scrollLeft; });
    nav.addEventListener('mouseleave', () => isDown = false); nav.addEventListener('mouseup', () => isDown = false);
    nav.addEventListener('mousemove', (e) => { if (!isDown) return; e.preventDefault(); nav.scrollLeft = scrollLeft - ((e.pageX - nav.offsetLeft - startX) * 2); });
}

async function loadTema() {
    const t = await getDoc(doc(db, "config", "tema"));
    if(t.exists()) { const d = t.data(); if(d.bg) document.getElementById('cor-bg').value = d.bg; if(d.card) document.getElementById('cor-card').value = d.card; if(d.txt) document.getElementById('cor-txt').value = d.txt; if(d.acc) document.getElementById('cor-acc').value = d.acc; }
}
document.getElementById('form-cores').onsubmit = async(e) => { e.preventDefault(); await setDoc(doc(db, "config", "tema"), { bg: document.getElementById('cor-bg').value, card: document.getElementById('cor-card').value, txt: document.getElementById('cor-txt').value, acc: document.getElementById('cor-acc').value }); customAlert("Identidade visual aplicada!"); };

document.getElementById('form-carrossel').onsubmit = async(e) => {
    e.preventDefault(); const btn = document.getElementById('btn-up-car'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; btn.disabled = true;
    try { let count = (await getDocs(collection(db, "carrossel"))).size; for(let f of document.getElementById('car-files').files) { let url = await upImg(f); if(url) { await addDoc(collection(db, "carrossel"), { url: url, order: count }); count++; } } customAlert("Carrossel Atualizado!"); loadCarrossel(); e.target.reset(); document.getElementById('car-file-name').textContent = 'Nenhum arquivo'; } catch(err) {} finally { btn.innerHTML = '<i class="fas fa-upload"></i> Adicionar ao Carrossel'; btn.disabled = false; }
};

let dragSrcEl = null;
window.handleDragStart = function(e) { dragSrcEl = this; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', this.innerHTML); this.classList.add('dragging'); };
window.handleDragOver = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; };
window.handleDrop = async function(e) { e.preventDefault(); if (dragSrcEl != this) { this.parentNode.insertBefore(dragSrcEl, this); const items = document.querySelectorAll('.carrossel-item'); for (let i = 0; i < items.length; i++) await updateDoc(doc(db, 'carrossel', items[i].getAttribute('data-id')), { order: i }); } return false; };
window.handleDragEnd = function(e) { this.classList.remove('dragging'); }

async function loadCarrossel() {
    const s = await getDocs(collection(db, "carrossel")); const div = document.getElementById("galeria-preview"); div.innerHTML = "";
    let arr = []; s.forEach(d => arr.push({id: d.id, ...d.data()})); arr.sort((a,b) => (a.order || 0) - (b.order || 0));
    arr.forEach(d => { div.innerHTML += `<div class="carrossel-item" data-id="${d.id}" draggable="true" ondragstart="window.handleDragStart.call(this, event)" ondragover="window.handleDragOver.call(this, event)" ondrop="window.handleDrop.call(this, event)" ondragend="window.handleDragEnd.call(this, event)"><img src="${d.url}" style="width:120px; height:120px; object-fit:cover; border-radius:15px; border:2px solid var(--favu-rust);"><button type="button" style="position:absolute; top:-8px; right:-8px; background:#E60000; color:white; border:none; border-radius:50%; width:25px; height:25px; cursor:pointer;" onclick="window.delDoc('carrossel','${d.id}')"><i class="fas fa-times"></i></button></div>`; });
}

window.delDoc = async(col, id) => { customConfirm("Excluir definitivamente?", async () => { await deleteDoc(doc(db, col, id)); if(col==='avisos') loadAvisos(); if(col==='carrossel') loadCarrossel(); }); };

window.inicializarKanban = function() {
    const board = document.getElementById('kanban-board'); if(!board) return; board.innerHTML = '';
    const bulkSelect = document.getElementById('bulk-move-select'); if(bulkSelect) bulkSelect.innerHTML = '';
    window.STATUS_FLOW.forEach(status => {
        board.innerHTML += `<div class="kanban-column" data-status="${status}"><div class="column-header"><div style="display:flex; align-items:center; gap:10px;"><input type="checkbox" class="column-select-all-checkbox" onclick="window.toggleSelectColumn(this, '${status}')"><span class="column-title-text">${getStatusPedidoLabel(status)} (<span class="count-badge">0</span>)</span></div></div><div class="column-content" id="col-${limparString(status)}" ondrop="window.drop(event)" ondragover="window.allowDrop(event)"></div></div>`;
        if(bulkSelect) bulkSelect.innerHTML += `<option value="${status}">${getStatusPedidoLabel(status)}</option>`;
    });
};

function normalizarStatusPedidoFluxo(status) {
    const valor = String(status || '').trim();
    if (valor.toLowerCase() === 'aguardando retirada') return 'Retirada';
    return valor || 'Pedidos Orçados';
}

function getStatusPedidoLabel(status) {
    const labels = {
        'Pedidos Orçados': 'Orçados',
        'Pedido Recebido': 'Recebido',
        'Pedido Confirmado': 'Confirmado',
        'Aguardando Retirada': 'Retirada',
        'Retirada': 'Retirada',
        'Entregue': 'Entregue',
        'Cancelado': 'Cancelado'
    };
    return labels[status] || status;
}

function limparString(str) { return str.replace(/[^a-zA-Z0-9]/g, ''); }

function criarDataLocal(a, m, d) {
    const ano = Number(a);
    const mes = Number(m);
    const dia = Number(d);
    if (!ano || !mes || !dia) return null;

    const data = new Date(ano, mes - 1, dia, 0, 0, 0, 0);
    if (
        data.getFullYear() !== ano ||
        data.getMonth() !== mes - 1 ||
        data.getDate() !== dia
    ) {
        return null;
    }

    return data;
}

function parseDataBR(s) {
    if (!s) return null;

    if (s instanceof Date && !isNaN(s.getTime())) {
        return new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
    }

    if (typeof s === 'object') {
        if (typeof s.toDate === 'function') return parseDataBR(s.toDate());
        if (s.seconds) return parseDataBR(new Date(s.seconds * 1000));
    }

    const texto = String(s).trim();
    let m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
        let ano = Number(m[3]);
        if (ano < 100) ano += 2000;
        return criarDataLocal(ano, Number(m[2]), Number(m[1]));
    }

    m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return criarDataLocal(Number(m[1]), Number(m[2]), Number(m[3]));

    return null;
}

function parseDataISO(s) {
    if (!s) return null;

    const texto = String(s).trim();
    let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return criarDataLocal(Number(m[1]), Number(m[2]), Number(m[3]));

    return parseDataBR(s);
}

function normalizarTextoBuscaPedido(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizarNumeroBuscaPedido(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function telefoneCombinaBuscaPedido(telefonePedido, buscaDigitada) {
    const numeroPedido = normalizarNumeroBuscaPedido(telefonePedido);
    const numeroBusca = normalizarNumeroBuscaPedido(buscaDigitada);

    if (!numeroBusca) return false;
    if (!numeroPedido) return false;

    return numeroPedido.includes(numeroBusca) || numeroBusca.includes(numeroPedido);
}

function nomeCombinaBuscaPedido(nomePedido, buscaDigitada) {
    const nome = normalizarTextoBuscaPedido(nomePedido);
    const busca = normalizarTextoBuscaPedido(buscaDigitada);

    if (!busca) return false;
    if (!nome) return false;

    return nome.includes(busca) || busca.includes(nome);
}

function pedidoCombinaBuscaLivre(p, buscaDigitada) {
    const busca = String(buscaDigitada || '').trim();
    if (!busca) return true;

    const buscaTexto = normalizarTextoBuscaPedido(busca);
    const buscaNumero = normalizarNumeroBuscaPedido(busca);

    if (nomeCombinaBuscaPedido(p.Nome_Cliente || '', busca)) return true;
    if (telefoneCombinaBuscaPedido(p.Numero || '', busca)) return true;

    const idPedido = normalizarTextoBuscaPedido(p.ID_do_Pedido || '');
    if (idPedido && idPedido.includes(buscaTexto)) return true;

    if (buscaNumero && normalizarNumeroBuscaPedido(p.ID_do_Pedido || '').includes(buscaNumero)) return true;

    return false;
}

function formatarDataDisplayPedido(data) {
    if (!data) return '';
    return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
}

function formatarDataISOFiltroPedido(data) {
    if (!data) return '';
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function parseFiltroDataDigitadoPedido(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return null;

    const partes = texto
        .split(/\s*(?:-|–|—|a|até|ate|,)\s*/i)
        .map(p => p.trim())
        .filter(Boolean);

    if (partes.length >= 2) {
        const inicio = parseDataBR(partes[0]) || parseDataISO(partes[0]);
        const fim = parseDataBR(partes[1]) || parseDataISO(partes[1]);
        if (inicio && fim) {
            if (fim < inicio) return { inicio: fim, fim: inicio };
            return { inicio, fim };
        }
    }

    const unica = parseDataBR(texto) || parseDataISO(texto);
    if (unica) return { inicio: unica, fim: null };

    return null;
}

function sincronizarFiltroDataOcultoPeloDisplay(valor, normalizarDisplay = false) {
    const campoOculto = document.getElementById('date-input');
    const campoDisplay = document.getElementById('date-filter-display');
    if (!campoOculto) return;

    const texto = String(valor || '').trim();
    if (!texto) {
        campoOculto.value = '';
        window.dataInicialIntervalo = null;
        window.dataFinalIntervalo = null;
        return;
    }

    const intervalo = parseFiltroDataDigitadoPedido(texto);
    if (!intervalo) return;

    window.dataInicialIntervalo = intervalo.inicio;
    window.dataFinalIntervalo = intervalo.fim;

    if (intervalo.inicio && intervalo.fim) {
        campoOculto.value = `${formatarDataISOFiltroPedido(intervalo.inicio)},${formatarDataISOFiltroPedido(intervalo.fim)}`;
        if (normalizarDisplay && campoDisplay) campoDisplay.value = `${formatarDataDisplayPedido(intervalo.inicio)} - ${formatarDataDisplayPedido(intervalo.fim)}`;
    } else if (intervalo.inicio) {
        campoOculto.value = formatarDataISOFiltroPedido(intervalo.inicio);
        if (normalizarDisplay && campoDisplay) campoDisplay.value = formatarDataDisplayPedido(intervalo.inicio);
    }
}

window.aplicarFiltroDataDigitada = function(valor, normalizarDisplay = false) {
    sincronizarFiltroDataOcultoPeloDisplay(valor, normalizarDisplay);
    window.filtrarPedidos?.();
};


function formatarDataParaInputPedido(valor) {
    const data = parseDataBR(valor);
    if (!data) return '';
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function formatarDataInputParaBR(valor) {
    const data = parseDataISO(valor);
    if (!data) return '';
    return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
}

function garantirValorSelectPedido(select, valor) {
    if (!select) return;
    const value = (valor || '').trim();

    if (!value) {
        select.value = '';
        return;
    }

    const existe = Array.from(select.options).some(option => option.value === value);
    if (!existe) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.insertBefore(option, select.firstChild);
    }

    select.value = value;
}

function normalizarHoraPedidoManual(valor) {
    if (!valor) return '';

    const texto = String(valor).trim();
    let hora = null;
    let minuto = null;

    const comSeparador = texto.match(/^(\d{1,2})\D+(\d{1,2})$/);
    if (comSeparador) {
        hora = Number(comSeparador[1]);
        minuto = Number(comSeparador[2]);
    } else {
        const numeros = texto.replace(/\D/g, '').slice(0, 4);
        if (!numeros) return '';

        if (numeros.length <= 2) {
            hora = Number(numeros);
            minuto = 0;
        } else if (numeros.length === 3) {
            // Ex.: 930 => 09:30
            hora = Number(numeros.slice(0, 1));
            minuto = Number(numeros.slice(1));
        } else {
            hora = Number(numeros.slice(0, 2));
            minuto = Number(numeros.slice(2));
        }
    }

    if (!Number.isInteger(hora) || !Number.isInteger(minuto)) return '';
    if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return '';

    return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

window.formatarCampoHoraPedido = function(input) {
    if (!input) return;

    const numeros = String(input.value || '').replace(/\D/g, '').slice(0, 4);

    if (numeros.length === 3 && Number(numeros.slice(0, 2)) > 23) {
        input.value = `${numeros.slice(0, 1)}:${numeros.slice(1)}`;
    } else if (numeros.length === 4) {
        input.value = `${numeros.slice(0, 2)}:${numeros.slice(2)}`;
    } else {
        input.value = numeros;
    }
};

window.normalizarCampoHoraPedido = function(input) {
    if (!input) return;
    const horaFormatada = normalizarHoraPedidoManual(input.value);
    if (horaFormatada) input.value = horaFormatada;
};

function parseHorario(s) { if (!s || typeof s !== 'string') return 0; const p = s.trim().split(':'); if (p.length !== 2) return 0; const h = parseInt(p[0], 10), m = parseInt(p[1], 10); if (isNaN(h) || isNaN(m)) return 0; return h * 60 + m; }
function ordenarPedidosPorDataHorario(pedidos) { return pedidos.sort((a, b) => { const dA = parseDataBR(a.Data_Entrega), dB = parseDataBR(b.Data_Entrega); if (!dA && !dB) return 0; if (!dA) return 1; if (!dB) return -1; const diff = dA.getTime() - dB.getTime(); if (diff !== 0) return diff; return parseHorario(a.Horario_Entrega) - parseHorario(b.Horario_Entrega); }); }
function converterValorParaNumero(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;

    let s = String(v)
        .replace(/R\$/gi, '')
        .replace(/\s/g, '')
        .replace(/[^\d,.-]/g, '');

    if (!s || s === '-' || s === ',' || s === '.') return 0;

    const temVirgula = s.includes(',');
    const temPonto = s.includes('.');

    if (temVirgula && temPonto) {
        const ultimaVirgula = s.lastIndexOf(',');
        const ultimoPonto = s.lastIndexOf('.');

        if (ultimaVirgula > ultimoPonto) {
            // Formato BR: 1.234,56
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            // Formato US: 1,234.56
            s = s.replace(/,/g, '');
        }
    } else if (temVirgula) {
        const partes = s.split(',');
        const decimais = partes[partes.length - 1] || '';

        if (decimais.length > 0 && decimais.length <= 2) {
            s = partes.slice(0, -1).join('').replace(/\./g, '') + '.' + decimais;
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (temPonto) {
        const partes = s.split('.');
        const decimais = partes[partes.length - 1] || '';

        if (partes.length === 2 && decimais.length > 0 && decimais.length <= 2) {
            // Decimal com ponto: 1.30
            s = partes[0] + '.' + decimais;
        } else {
            // Milhar com ponto: 1.300 ou 1.300.000
            s = s.replace(/\./g, '');
        }
    }

    const n = Number(s);
    return isNaN(n) ? 0 : n;
}
function formatarValorComCentavos(v) { return converterValorParaNumero(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function formatarNumeroMoedaPedido(v) {
    const n = Number(v);
    return (isNaN(n) ? 0 : n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDataValidadeCupom(dadosCupom) {
    if (!dadosCupom) return null;
    const raw = dadosCupom.dataValidade;
    if (!raw) return null;
    const data = raw?.toDate ? raw.toDate() : new Date(raw);
    if (isNaN(data.getTime())) return null;
    data.setHours(23, 59, 59, 999);
    return data;
}

function isCupomVencido(dadosCupom) {
    const validade = getDataValidadeCupom(dadosCupom);
    return validade ? new Date() > validade : false;
}

function getCupomMaxUsos(dadosCupom) {
    return Number(dadosCupom?.quantidadeDisponivel ?? dadosCupom?.maxUsos ?? 0) || 0;
}

function contarPedidosComCupom(codigo) {
    const cupomCodigo = String(codigo || '').trim().toUpperCase();
    if (!cupomCodigo || !Array.isArray(window.todosPedidos)) return 0;

    return window.todosPedidos.filter(p => {
        if (isPedidoExcluidoPainel(p)) return false;
        return extrairCodigoCupomPedido(p.Cupom || '') === cupomCodigo;
    }).length;
}

function getCupomUsosAtuais(dadosCupom) {
    const usosSalvos = Number(dadosCupom?.usosAtuais ?? dadosCupom?.usos ?? 0) || 0;
    const codigo = String(dadosCupom?.codigo || dadosCupom?.id || '').trim().toUpperCase();
    const usosEmPedidos = contarPedidosComCupom(codigo);
    return Math.max(usosSalvos, usosEmPedidos);
}

function isCupomEsgotado(dadosCupom) {
    const max = getCupomMaxUsos(dadosCupom);
    const usos = getCupomUsosAtuais(dadosCupom);
    return max > 0 && usos >= max;
}

function calcularDescontoCupom(dadosCupom, subtotal) {
    const valor = converterValorParaNumero(dadosCupom?.valor || 0);
    let desconto = 0;
    if (dadosCupom?.tipo === 'percentual') desconto = subtotal * (valor / 100);
    else desconto = valor;
    return Math.min(Math.max(0, desconto), subtotal);
}

async function validarCupomAdmin(codigo, subtotal) {
    const cupomCodigo = String(codigo || '').trim().toUpperCase();
    if (!cupomCodigo) return { ok: false, motivo: 'Informe um cupom.' };

    const cupomSnap = await getDoc(doc(db, "cupons", cupomCodigo));
    if (!cupomSnap.exists()) return { ok: false, motivo: 'Cupom não encontrado.' };

    const dadosCupom = { codigo: cupomCodigo, ...cupomSnap.data() };

    const statusOperacional = getStatusOperacionalCupom(dadosCupom);
    if (statusOperacional === 'inativo') return { ok: false, motivo: 'Cupom inativo.' };
    if (isCupomVencido(dadosCupom)) return { ok: false, motivo: 'Cupom expirado.' };
    if (isCupomEsgotado(dadosCupom)) return { ok: false, motivo: 'Cupom esgotado.' };

    const minimo = converterValorParaNumero(dadosCupom.valorMinimo || 0);
    if (subtotal < minimo) return { ok: false, motivo: `Mínimo de R$ ${formatarNumeroMoedaPedido(minimo)} para usar.` };

    const desconto = calcularDescontoCupom(dadosCupom, subtotal);
    if (desconto <= 0) return { ok: false, motivo: 'Cupom sem desconto válido.' };

    return { ok: true, codigo: cupomCodigo, dados: dadosCupom, desconto };
}

async function ajustarUsoCupom(codigo, delta) {
    const cupomCodigo = String(codigo || '').trim().toUpperCase();
    const ajuste = Number(delta) || 0;
    if (!cupomCodigo || ajuste === 0) return;

    try {
        const refCupom = doc(db, "cupons", cupomCodigo);
        const snapCupom = await getDoc(refCupom);
        if (!snapCupom.exists()) return;

        const dados = snapCupom.data();
        const usosSalvos = Number(dados.usosAtuais ?? dados.usos ?? 0) || 0;
        await updateDoc(refCupom, {
            usosAtuais: Math.max(0, usosSalvos + ajuste),
            updatedAt: Date.now()
        });
    } catch (err) {
        console.warn("Não foi possível ajustar uso do cupom:", err);
    }
}

async function registrarUsoCupom(codigo) {
    await ajustarUsoCupom(codigo, 1);
}

async function ajustarUsoCupomPedidoEditado(cupomAnterior, cupomAtual, novoPedido = false) {
    const anterior = String(cupomAnterior || '').trim().toUpperCase();
    const atual = String(cupomAtual || '').trim().toUpperCase();

    if (novoPedido) {
        if (atual) await ajustarUsoCupom(atual, 1);
        return;
    }

    if (anterior === atual) return;
    if (anterior) await ajustarUsoCupom(anterior, -1);
    if (atual) await ajustarUsoCupom(atual, 1);
}

function escapeHtmlPedido(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function extrairCodigoCupomPedido(...fontes) {
    for (const fonte of fontes) {
        const partes = String(fonte || '')
            .split(/\n|\|/g)
            .map(parte => parte.trim())
            .filter(Boolean);

        for (let parte of partes) {
            if (/^Desconto(?:\s+Manual)?\b/i.test(parte)) continue;

            let texto = parte
                .replace(/^Cupom\s*:?\s*/i, '')
                .replace(/\(-?\s*R?\$\s*[\d.,]+\)/gi, '')
                .replace(/:\s*-?\s*R?\$\s*[\d.,]+.*$/i, '')
                .replace(/-?\s*R?\$\s*[\d.,]+.*$/i, '')
                .replace(/\s*\([^)]*\)\s*$/g, '')
                .trim();

            if (!texto || /^(desconto|total|valor dos itens|bruto|liquido|líquido)$/i.test(texto)) continue;
            return texto.toUpperCase();
        }
    }

    return '';
}

function extrairDescontoManualPedido(...fontes) {
    let total = 0;

    fontes.forEach(fonte => {
        String(fonte || '')
            .split(/\n|\|/g)
            .map(parte => parte.trim())
            .filter(Boolean)
            .forEach(parte => {
                const ehLinhaDesconto = /^Desconto(?:\s+Manual)?\b/i.test(parte);
                const ehCupomLegadoComValor = /^Cupom\b/i.test(parte) && /R\$/i.test(parte);

                if (!ehLinhaDesconto && !ehCupomLegadoComValor) return;

                total += extrairValorDescontoLinhaPedido(parte);
            });
    });

    return total;
}

function limparDescontoManualPedido(valor) {
    return extrairCodigoCupomPedido(valor);
}

function montarCupomDescontoPedido(codigoCupom, descontoTotal) {
    const codigo = String(codigoCupom || '').trim().toUpperCase();
    const desconto = Math.max(0, Number(descontoTotal) || 0);
    const linhas = [];

    if (codigo) linhas.push(`Cupom: ${codigo}`);
    if (desconto > 0) linhas.push(`Desconto: -R$${formatarNumeroMoedaPedido(desconto)}`);

    return linhas.join('\n');
}

function formatarCupomDescontoPedido(valor) {
    const codigo = extrairCodigoCupomPedido(valor);
    const desconto = extrairDescontoManualPedido(valor);
    const linhas = [];

    if (codigo) {
        linhas.push(`<div class="card-cupom-line"><span class="card-cupom-label">Cupom:</span> ${escapeHtmlPedido(codigo)}</div>`);
    }

    if (desconto > 0) {
        linhas.push(`<div class="card-cupom-line"><span class="card-cupom-label">Desconto:</span> -R$${formatarNumeroMoedaPedido(desconto)}</div>`);
    }

    return linhas.join('');
}

function preencherDescontoManualEditPedido(valor) {
    const desconto = Math.max(0, Number(valor) || 0);
    const campo = document.getElementById('edit-desconto-pedido');
    const status = document.getElementById('edit-desconto-status');

    window.editDescontoManualAplicado = desconto;

    if (campo) campo.value = desconto > 0 ? formatarNumeroMoedaPedido(desconto).replace('.', '').replace(',', '.') : '0';

    if (status) {
        if (desconto > 0) {
            status.textContent = `Desconto aplicado: -R$ ${formatarNumeroMoedaPedido(desconto)}`;
            status.className = 'edit-cupom-status ok';
        } else {
            status.textContent = '';
            status.className = 'edit-cupom-status';
        }
    }
}
function normalizarStatusPagamentoPedido(valor) {
    const v = String(valor || '').trim().toLowerCase();
    if (!v || v === 'pagamento pendente' || v === 'pendente') return 'Pendente';
    if (v.includes('50')) return 'Pago 50%';
    if (v.includes('100') || v === 'pago') return 'Pago 100%';
    return valor || 'Pendente';
}
function gerarPedidoId(prefixo) {
    return `${prefixo}-${Date.now().toString()}`;
}
function extrairNumeroIdPedido(id) {
    return String(id || '').replace(/^(PED|ORC|PD|CPD|EXC|EXD)-?/i, '');
}
function getPedidoDocumentoId(id) {
    const pedido = window.todosPedidos.find(p => p.ID_do_Pedido === id || p._docId === id);
    return pedido?._docId || id;
}
function calcularNovoIdExcluido(id) {
    return `EXC-${extrairNumeroIdPedido(id)}`;
}
function isPedidoExcluidoPainel(p) {
    const id = String(p?.ID_do_Pedido || '');
    const status = String(p?.Status_do_Pedido || '').toLowerCase();
    return p?.excluido === true || /^EXC-|^EXD-/i.test(id) || status === 'excluído' || status === 'excluido';
}
function extrairValorDescontoLinhaPedido(linha) {
    const texto = String(linha || '').trim();
    if (!/(desconto|cupom)/i.test(texto)) return 0;

    let total = 0;

    // Prioriza apenas valores monetários explícitos com R$.
    const valoresMonetarios = texto.match(/-?\s*R\$\s*[\d.,]+/gi) || [];
    valoresMonetarios.forEach(valor => {
        const numero = Math.abs(converterValorParaNumero(valor));
        if (numero > 0) total += numero;
    });

    if (total > 0) return total;

    // Compatibilidade com algum registro antigo do tipo "Desconto: 27,00".
    // Não vale para linha de Cupom, para não capturar números no código do cupom.
    if (/^Desconto(?:\s+Manual)?\b/i.test(texto)) {
        const match = texto.match(/:\s*-?\s*([\d.,]+)/i) || texto.match(/Desconto(?:\s+Manual)?[^\d-]*-?\s*([\d.,]+)/i);
        if (match) {
            const numero = Math.abs(converterValorParaNumero(match[1]));
            if (numero > 0) return numero;
        }
    }

    return 0;
}

function extrairDescontosTotaisPedido(...fontes) {
    let total = 0;

    fontes.forEach(fonte => {
        String(fonte || '')
            .split(/\n|\|/g)
            .map(linha => linha.trim())
            .filter(Boolean)
            .forEach(linha => {
                total += extrairValorDescontoLinhaPedido(linha);
            });
    });

    return total;
}

function calcularValorPedidoPorItensCorrigidos(p) {
    if (!p || !p.Resumo_dos_Itens) return null;

    const itens = parseResumoEditPedido(p.Resumo_dos_Itens || '');
    if (!itens.length) return null;

    const subtotal = itens.reduce((acc, item) => {
        const qtd = parseInt(item.qtd) || 0;
        const preco = converterValorParaNumero(item.preco);
        return acc + (qtd * preco);
    }, 0);

    if (subtotal <= 0) return null;

    const descontoCupom = extrairDescontosTotaisPedido(p.Cupom || '');
    return Math.max(0, subtotal - descontoCupom);
}

function calcularValorPedido(p) {
    const valorCorrigidoPorItens = calcularValorPedidoPorItensCorrigidos(p);
    if (valorCorrigidoPorItens !== null) return valorCorrigidoPorItens;
    if (!p || !p.Total_Final) return 0;
    return converterValorParaNumero(p.Total_Final);
}

function normalizarFormaPagamentoPedido(valor) {
    const v = String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    if (v.includes('link')) return 'Crédito Link';
    if (v.includes('retirada')) return 'Crédito Retirada';
    if (v.includes('credito') || v.includes('cart')) return 'Crédito';
    if (v.includes('debito')) return 'Débito';
    if (v.includes('dinheiro')) return 'Dinheiro';
    if (v.includes('pix')) return 'Pix';
    if (v.includes('confirmar')) return 'A confirmar';
    return String(valor || '').trim();
}

function getModalidadeCreditoPedido(p) {
    const forma = normalizarFormaPagamentoPedido(p?.Forma_de_Pagamento || '');
    if (forma === 'Crédito Link') return 'Pagamento via Link';
    if (forma === 'Crédito Retirada') return 'Pagamento na retirada';
    return String(p?.Modalidade_Credito || p?.Modalidade_Pagamento || '').trim();
}

function formatarPagamentoPedidoTexto(forma, modalidadeCredito = '') {
    const formaNormalizada = normalizarFormaPagamentoPedido(forma);
    if (formaNormalizada === 'Crédito') {
        if (String(modalidadeCredito || '').toLowerCase().includes('link')) return 'Crédito Link';
        if (String(modalidadeCredito || '').toLowerCase().includes('retirada')) return 'Crédito Retirada';
    }
    return formaNormalizada || '';
}

function obterFormaPagamentoFiltroPedido(p) {
    const textoCompleto = `${p?.Forma_de_Pagamento || ''} ${p?.Modalidade_Credito || ''} ${p?.Modalidade_Pagamento || ''}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    if (textoCompleto.includes('link')) return 'Crédito Link';
    if (textoCompleto.includes('retirada')) return 'Crédito Retirada';
    if (textoCompleto.includes('debito')) return 'Débito';

    const forma = normalizarFormaPagamentoPedido(p?.Forma_de_Pagamento || '');

    if (forma === 'Crédito') {
        return 'Crédito Link';
    }

    return forma;
}


function getTaxaPagamentoInfo(p) {
    const forma = normalizarFormaPagamentoPedido(p?.Forma_de_Pagamento || '');
    const modalidade = getModalidadeCreditoPedido(p).toLowerCase();

    if (forma === 'Débito') {
        return { percentual: 1.99, label: 'Taxa Débito' };
    }

    if (forma === 'Crédito Link' || (forma === 'Crédito' && modalidade.includes('link'))) {
        return { percentual: 4.98, label: 'Taxa Crédito' };
    }

    if (forma === 'Crédito Retirada' || (forma === 'Crédito' && modalidade.includes('retirada'))) {
        return { percentual: 3.09, label: 'Taxa Crédito' };
    }

    return { percentual: 0, label: '' };
}

function calcularTaxaPagamentoPedido(p) {
    const info = getTaxaPagamentoInfo(p);
    const total = calcularValorPedido(p);
    return Math.max(0, total * ((Number(info.percentual) || 0) / 100));
}

function calcularValorFaturamentoPedido(p) {
    return Math.max(0, calcularValorPedido(p) - calcularTaxaPagamentoPedido(p));
}

function montarDadosTaxaPagamento(p) {
    const info = getTaxaPagamentoInfo(p);
    const taxa = calcularTaxaPagamentoPedido(p);
    const recebido = calcularValorFaturamentoPedido(p);

    return {
        Taxa_Pagamento: info.label || '',
        Percentual_Taxa_Pagamento: info.percentual || 0,
        Valor_Taxa_Pagamento: taxa > 0 ? formatarNumeroMoedaPedido(taxa) : '',
        Valor_Recebido: taxa > 0 ? formatarNumeroMoedaPedido(recebido) : ''
    };
}

function formatarTaxaPagamentoHTML(p) {
    return '';
}

window.toggleCreditoPedidoAdmin = function() {
    // Mantido apenas por compatibilidade com versões antigas. Não há mais campo separado de tipo de crédito.
};


function listenPedidos() {
    onSnapshot(collection(db, "pedidos"), (snap) => {
        window.todosPedidos = []; snap.forEach(docSnap => { let d = docSnap.data(); if (!d.ID_do_Pedido) d.ID_do_Pedido = docSnap.id; d._docId = docSnap.id; window.todosPedidos.push(d); });
        window.filtrarPedidos();
        window.renderCupons?.();
    });
}

window.obterPedidosDaSemanaAtual = function() {
    let hoje = new Date(); hoje.setHours(0,0,0,0);
    let diaSemana = hoje.getDay(); // 0 é Domingo, 1 é Segunda...
    let diff = hoje.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1); // Ajusta para Segunda-feira
    
    let segunda = new Date(hoje); segunda.setDate(diff);
    let domingo = new Date(segunda); domingo.setDate(segunda.getDate() + 6); // Soma 6 dias para o Domingo

    return window.todosPedidos.filter(p => {
        if (isPedidoExcluidoPainel(p)) return false;
        const d = parseDataBR(p.Data_Entrega);
        return d && d.getTime() >= segunda.getTime() && d.getTime() <= domingo.getTime();
    });
}

window.obterPedidosFiltrados = function() {
    const s = document.getElementById('search-input-pedidos') ? document.getElementById('search-input-pedidos').value.trim() : '';
    const displayData = document.getElementById('date-filter-display') ? document.getElementById('date-filter-display').value.trim() : '';
    if (displayData) sincronizarFiltroDataOcultoPeloDisplay(displayData, false);

    const df = document.getElementById('date-input') ? document.getElementById('date-input').value : ''; 
    const sp = document.getElementById('filter-status-pagamento') ? document.getElementById('filter-status-pagamento').value : '';
    const fp = document.getElementById('filter-forma-pagamento') ? document.getElementById('filter-forma-pagamento').value : '';
    const ob = document.getElementById('filter-observacao') ? document.getElementById('filter-observacao').value : '';

    return window.todosPedidos.filter(p => {
        if (isPedidoExcluidoPainel(p)) return false;
        if (s && !pedidoCombinaBuscaLivre(p, s)) return false;

        if (df) {
            const dp = parseDataBR(p.Data_Entrega);
            if (!dp) return false;

            if (df.includes(',')) {
                const [di, dF] = df.split(',');
                const dtI = parseDataISO(di.trim());
                const dtF = parseDataISO(dF.trim());
                if (!dtI || !dtF || !(dp.getTime() >= dtI.getTime() && dp.getTime() <= dtF.getTime())) return false;
            } else {
                const dt = parseDataISO(df.trim());
                if (!dt || dp.getTime() !== dt.getTime()) return false;
            }
        }

        if (sp && normalizarStatusPagamentoPedido(p.Status_Pagamento) !== normalizarStatusPagamentoPedido(sp)) return false;
        if (fp) {
            const formaFiltro = normalizarFormaPagamentoPedido(fp);
            const formaPedido = obterFormaPagamentoFiltroPedido(p);
            if (formaPedido !== formaFiltro) return false;
        }
        if (ob) { const tO = p.Observacoes && p.Observacoes.trim() !== ''; if (ob === 'com' && !tO) return false; if (ob === 'sem' && tO) return false; }
        return true;
    });
}

let timerFiltroPedidos;
window.filtrarPedidos = function() {
    // Cancela a busca anterior se o usuário ainda estiver digitando (Debounce)
    clearTimeout(timerFiltroPedidos);
    timerFiltroPedidos = setTimeout(() => {
        const displayData = document.getElementById('date-filter-display') ? document.getElementById('date-filter-display').value.trim() : '';
        if (displayData) sincronizarFiltroDataOcultoPeloDisplay(displayData, false);

        // Sem filtro de data, a tela deve exibir TODOS os pedidos, não apenas a semana atual.
        const escopo = window.obterPedidosFiltrados();
        window.renderizar(escopo);
    }, 350);
}

window.renderizar = function(pedidos) {
    pedidos = (pedidos || []).filter(p => !isPedidoExcluidoPainel(p));
    document.querySelectorAll('.column-content').forEach(el => el.innerHTML = '');
    const contadores = {}; window.STATUS_FLOW.forEach(s => contadores[s] = 0);
    const pedStatus = {}; window.STATUS_FLOW.forEach(s => pedStatus[s] = []);

    pedidos.forEach(p => { const statusAtual = normalizarStatusPedidoFluxo(p.Status_do_Pedido || 'Pedidos Orçados'); const s = window.STATUS_FLOW.find(x => x.toLowerCase() === statusAtual.toLowerCase()) || 'Pedidos Orçados'; pedStatus[s].push(p); });

    window.STATUS_FLOW.forEach(s => {
        const ord = ordenarPedidosPorDataHorario([...pedStatus[s]]);
        const col = document.getElementById(`col-${limparString(s)}`);
        if (col) {
            // Removido o "Empty State". Se não houver pedidos, o loop simplesmente não roda
            // e a coluna fica perfeitamente limpa e vazia!
            ord.forEach(p => { col.appendChild(window.criarCardHTML(p)); contadores[s]++; });
        }
    });

    window.STATUS_FLOW.forEach(s => { const c = document.querySelector(`.kanban-column[data-status="${s}"]`); if(c) c.querySelector('.count-badge').textContent = contadores[s]; });
    if (window.innerWidth <= 768) document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('expanded'));
    window.configurarAcordeaoColunas(); window.atualizarDashboardPedidos();
}

window.atualizarDashboardPedidos = function() {
    let pedCalc = window.ticketsSelecionados.size > 0 
        ? window.todosPedidos.filter(p => window.ticketsSelecionados.has(p.ID_do_Pedido)) 
        : ( (document.getElementById('search-input-pedidos')?.value.trim() || document.getElementById('date-input')?.value) 
            ? window.obterPedidosFiltrados() 
            : window.obterPedidosFiltrados().filter(p => window.obterPedidosDaSemanaAtual().includes(p)) );
            
    let tv = 0, tp = 0; 
    pedCalc.filter(p => !isPedidoExcluidoPainel(p)).forEach(p => { 
        if (!(p.Status_do_Pedido || '').toLowerCase().includes('cancelado')) {
            tp++; 
            tv += calcularValorFaturamentoPedido(p); 
        }
    });
    if(document.querySelector('#dashboard-totals strong')) document.querySelector('#dashboard-totals strong').textContent = tv.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if(document.getElementById('total-count')) document.getElementById('total-count').textContent = `${tp} pedido${tp !== 1 ? 's' : ''}`;
}

window.criarCardHTML = function(p) {
    const c = document.createElement('div'); const st = normalizarStatusPedidoFluxo(p.Status_do_Pedido || '').replace(/\s+/g, '-'); const tO = p.Observacoes && p.Observacoes.trim() !== '';
    c.className = `pedido-card status-${st} ${tO ? 'com-observacao' : ''} ${window.ticketsSelecionados.has(p.ID_do_Pedido) ? 'selected' : ''}`;
    if(window.isDragEnabled) c.draggable = true; c.id = `card-${p.ID_do_Pedido}`; c.dataset.id = p.ID_do_Pedido;
    if(window.isDragEnabled) {
        c.addEventListener('dragstart', window.drag);
        c.addEventListener('dragend', window.dragEnd);
    }
    c.addEventListener('click', (e) => { if(e.target.tagName !== 'SELECT' && e.target.type !== 'checkbox') window.abrirModalEdicao(p.ID_do_Pedido); });

    const pgStatus = normalizarStatusPagamentoPedido(p.Status_Pagamento || 'Pendente');
    const pg = pgStatus.toLowerCase(); let pC = pg.includes('50%') ? 'pg-parcial' : (pg.includes('100%') || pg === 'pago' ? 'pg-pago' : 'pg-pendente');
    const totalExibicaoPedido = calcularValorPedido(p);
    const cupomDescontoHTML = formatarCupomDescontoPedido(p.Cupom || '');
    const formaPagamentoNormalizada = normalizarFormaPagamentoPedido(p.Forma_de_Pagamento || '');
    const modalidadeCredito = getModalidadeCreditoPedido(p);
    const taxaPagamentoHTML = formatarTaxaPagamentoHTML(p);
    let tt = '', tc = '';
    const taxaPagamentoValorTag = calcularTaxaPagamentoPedido(p);
    const taxaPagamentoTextoTag = taxaPagamentoValorTag > 0 ? `<span class="payment-tag-taxa">-R$: ${formatarNumeroMoedaPedido(taxaPagamentoValorTag)}</span>` : '';
    const montarTagPagamentoComTaxa = (nome) => taxaPagamentoTextoTag ? `<span class="payment-tag-nome">${nome}</span>${taxaPagamentoTextoTag}` : nome;

    if (formaPagamentoNormalizada === 'Crédito Link') { tt = montarTagPagamentoComTaxa('Crédito Link'); tc = 'credito-link'; }
    else if (formaPagamentoNormalizada === 'Crédito Retirada') { tt = montarTagPagamentoComTaxa('Crédito Retirada'); tc = 'credito-retirada'; }
    else if (formaPagamentoNormalizada === 'Crédito') {
        const modalidadeLower = modalidadeCredito.toLowerCase();
        if (modalidadeLower.includes('link')) { tt = montarTagPagamentoComTaxa('Crédito Link'); tc = 'credito-link'; }
        else if (modalidadeLower.includes('retirada')) { tt = montarTagPagamentoComTaxa('Crédito Retirada'); tc = 'credito-retirada'; }
        else { tt = montarTagPagamentoComTaxa('Crédito'); tc = 'credito'; }
    }
    else if (formaPagamentoNormalizada === 'Débito') { tt = montarTagPagamentoComTaxa('Débito'); tc = 'debito'; }
    else if (formaPagamentoNormalizada === 'Dinheiro') { tt = 'DINHEIRO'; tc = 'dinheiro'; }
    else if (formaPagamentoNormalizada === 'Pix') { tt = 'PIX'; tc = 'pix'; }
    else if (formaPagamentoNormalizada === 'A confirmar') { tt = 'A CONFIRMAR'; tc = 'a-confirmar'; }
    else if (formaPagamentoNormalizada) { tt = formaPagamentoNormalizada.toUpperCase(); tc = formaPagamentoNormalizada.toLowerCase().replace(/[^a-z0-9]/g, ''); }

    c.innerHTML = `<div class="card-header"><input type="checkbox" class="card-checkbox" ${window.ticketsSelecionados.has(p.ID_do_Pedido) ? 'checked' : ''} onclick="window.toggleSelecao('${p.ID_do_Pedido}', this); event.stopPropagation();"><div style="text-align: right;"><div><span class="card-id">${p.ID_do_Pedido}</span></div>${tO ? '<div><span class="observacao-tag">OBSERVAÇÃO</span></div>' : ''}</div></div><br><div class="card-title">${p.Nome_Cliente}</div><div class="card-info-box"><div class="card-info-row"><span class="card-icon">🗓️</span> ${p.Data_Entrega || '--/--/----'}</div><div class="card-info-row"><span class="card-icon">⏰</span> ${p.Horario_Entrega || '--:--'}</div><div class="card-info-row"><span class="card-icon">📱</span> <span class="card-numero-text">${p.Numero || 'N/A'}</span></div></div>${cupomDescontoHTML ? `<div class="card-cupom">${cupomDescontoHTML}</div>` : ''}${taxaPagamentoHTML}<div class="card-price"><span>R$ ${formatarNumeroMoedaPedido(totalExibicaoPedido)}</span>${tt ? `<span class="payment-type-tag ${tc}">${tt}</span>` : ''}</div><div class="card-status-pagamento"><select class="${pC}" onchange="window.atualizarStatusPagamentoDireto('${p.ID_do_Pedido}', this)"><option value="Pendente" ${pg === 'pendente' || pg === 'pagamento pendente' ? 'selected' : ''}>Pendente</option><option value="Pago 50%" ${pg.includes('50') ? 'selected' : ''}>Pago 50%</option><option value="Pago 100%" ${pg.includes('100') || pg === 'pago' ? 'selected' : ''}>Pago 100%</option></select></div><div class="card-pedido-actions"><button type="button" class="btn-card-mini btn-card-whatsapp" title="Contato" aria-label="Contato" onclick="window.abrirModalWhatsApp('${p.ID_do_Pedido}'); event.stopPropagation();"><i class="fab fa-whatsapp"></i></button><button type="button" class="btn-card-mini btn-card-copy" title="Copiar" aria-label="Copiar" onclick="window.copiarPedido('${p.ID_do_Pedido}'); event.stopPropagation();"><i class="fas fa-copy"></i></button><button type="button" class="btn-card-mini btn-card-delete" title="Excluir" aria-label="Excluir" onclick="window.excluirPedidoLogico('${p.ID_do_Pedido}'); event.stopPropagation();"><i class="fas fa-trash"></i></button></div>`;
    return c;
}



window.copiarPedido = function(id) {
    const p = window.todosPedidos.find(x => x.ID_do_Pedido === id);
    if (!p) return;

    const tituloModalPedido = document.querySelector('#edit-modal-pedido .modal-header h3');
    if (tituloModalPedido) tituloModalPedido.textContent = 'Copiar Pedido';

    const novoId = gerarPedidoId('CPD');

    window.editPedidoModoCopia = true;
    window.editPedidoIdCopiaOriginal = id;
    window.editPedidoStatusCopia = p.Status_do_Pedido || 'Pedidos Orçados';

    document.getElementById('modal-id-display').textContent = `#${novoId}`;
    document.getElementById('edit-id-pedido').value = novoId;
    document.getElementById('edit-nome-pedido').value = p.Nome_Cliente || '';
    document.getElementById('edit-telefone-pedido').value = p.Numero || '';

    const dataPedidoInput = document.getElementById('edit-data-pedido');
    if (dataPedidoInput) dataPedidoInput.value = formatarDataParaInputPedido(p.Data_Entrega);

    const horaPedidoInput = document.getElementById('edit-hora-pedido');
    if (horaPedidoInput && horaPedidoInput.tagName === 'SELECT') garantirValorSelectPedido(horaPedidoInput, p.Horario_Entrega || '');
    else if (horaPedidoInput) horaPedidoInput.value = normalizarHoraPedidoManual(p.Horario_Entrega || '') || p.Horario_Entrega || '';

    const descontoManualExistente = extrairDescontoManualPedido(p.Cupom || '');
    const cupomSemDescontoManual = extrairCodigoCupomPedido(p.Cupom || '');

    document.getElementById('edit-forma-pedido').value = normalizarFormaPagamentoPedido(p.Forma_de_Pagamento || 'Pix');
    if (document.getElementById('edit-forma-pedido').value === 'Crédito') {
        const modalidadeLegada = getModalidadeCreditoPedido(p).toLowerCase();
        if (modalidadeLegada.includes('link')) document.getElementById('edit-forma-pedido').value = 'Crédito Link';
        else if (modalidadeLegada.includes('retirada')) document.getElementById('edit-forma-pedido').value = 'Crédito Retirada';
    }
    document.getElementById('edit-status-pgto-pedido').value = normalizarStatusPagamentoPedido(p.Status_Pagamento || 'Pendente');
    document.getElementById('edit-cupom-pedido').value = cupomSemDescontoManual;
    document.getElementById('edit-total-pedido').value = p.Total_Final || '';
    document.getElementById('edit-obs-pedido').value = p.Observacoes || '';
    document.getElementById('edit-resumo-pedido').value = p.Resumo_dos_Itens || '';

    const cupomStatusEdit = document.getElementById('edit-cupom-status');
    if (cupomStatusEdit) { cupomStatusEdit.textContent = ''; cupomStatusEdit.className = 'edit-cupom-status'; }

    window.editCupomPedidoOriginal = cupomSemDescontoManual;
    window.editCupomAplicado = null;
    preencherDescontoManualEditPedido(descontoManualExistente);

    window.preencherSelectProdutosAdicionais();
    window.carregarItensEditPedido(p.Resumo_dos_Itens || '');
    window.inicializarNovosItensPedidoEditado();
    window.openModal('edit-modal-pedido');
};

window.excluirPedidoLogico = function(id) {
    const p = window.todosPedidos.find(x => x.ID_do_Pedido === id);
    if (!p) return;

    const novoId = calcularNovoIdExcluido(id);
    window.customConfirm('Excluir este pedido da lista?', async () => {
        window.mostrarLoading(true);
        try {
            await updateDoc(doc(db, "pedidos", p._docId || id), {
                ID_do_Pedido: novoId,
                Status_do_Pedido: 'Excluído',
                excluido: true,
                excluidoEm: Date.now(),
                idOriginal: id
            });
            window.ticketsSelecionados.delete(id);
            window.todosPedidos = window.todosPedidos.filter(pedido => pedido.ID_do_Pedido !== id);
            window.filtrarPedidos();
            window.showToast("Pedido removido da lista.");
        } catch (err) {
            console.error(err);
            window.showToast("Erro ao excluir pedido.", true);
        }
        window.mostrarLoading(false);
    });
};

window.configurarAcordeaoColunas = function() {
    document.querySelectorAll('.column-header').forEach(h => { const nH = h.cloneNode(true); h.parentNode.replaceChild(nH, h); });
    if (window.innerWidth <= 768) { document.querySelectorAll('.column-header').forEach(h => { h.addEventListener('click', (e) => { if (e.target.type === 'checkbox' || e.target.closest('.column-select-all-checkbox')) return; const c = h.closest('.kanban-column'); if (!c) return; document.querySelectorAll('.kanban-column').forEach(col => { if (col !== c) col.classList.remove('expanded'); }); c.classList.toggle('expanded'); }); }); }
}

window.allowDrop = function(e) {
    e.preventDefault();
};

window.drag = function(e) {
    // Guarda o ID do card
    e.dataTransfer.setData("text", e.target.dataset.id);
    
    // Pequeno delay pra ele não achar que você soltou no mesmo milissegundo que clicou
    setTimeout(() => {
        e.target.style.opacity = '0.5';
    }, 0);
};

window.dragEnd = function(e) {
    e.target.style.opacity = '1';
};

window.drop = async function(e) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text");
    const coluna = e.target.closest('.kanban-column');
    
    if (!coluna) return;
    
    const novoStatus = coluna.dataset.status;
    const card = document.getElementById(`card-${id}`);
    
    if (card) {
        card.style.opacity = '1';
        coluna.querySelector('.column-content').appendChild(card);
        
        window.mostrarLoading(true);
        try {
            await updateDoc(doc(db, "pedidos", getPedidoDocumentoId(id)), { Status_do_Pedido: novoStatus });
            window.showToast("Status atualizado!");
        } catch (err) {
            window.showToast("Erro ao mover pedido", true);
        }
        window.mostrarLoading(false);
    }
};
window.toggleSelecao = function(id, cb) { if(cb.checked) window.ticketsSelecionados.add(id); else window.ticketsSelecionados.delete(id); window.atualizarBarraAcoesPedidos(); }
window.toggleSelectColumn = function(cb, s) { document.querySelector(`.kanban-column[data-status="${s}"]`).querySelectorAll('.card-checkbox').forEach(c => { c.checked = cb.checked; window.toggleSelecao(c.closest('.pedido-card').dataset.id, c); }); }
window.atualizarBarraAcoesPedidos = function() { const bar = document.getElementById('bulk-actions-bar-pedidos'); if(document.getElementById('selected-count-pedidos')) document.getElementById('selected-count-pedidos').textContent = `${window.ticketsSelecionados.size} itens`; if(bar) bar.style.display = window.ticketsSelecionados.size > 0 ? 'flex' : 'none'; window.atualizarDashboardPedidos(); }
window.limparSelecaoPedidos = function() { window.ticketsSelecionados.clear(); document.querySelectorAll('.card-checkbox, .column-select-all-checkbox').forEach(cb => cb.checked = false); window.atualizarBarraAcoesPedidos(); }

window.abrirBulkMove = function() { document.getElementById('bulk-move-modal').style.display = 'flex'; }
window.executarBulkMove = async function() { const nS = document.getElementById('bulk-move-select').value; window.mostrarLoading(true); await Promise.all(Array.from(window.ticketsSelecionados).map(id => updateDoc(doc(db, "pedidos", getPedidoDocumentoId(id)), { Status_do_Pedido: nS }))); window.mostrarLoading(false); document.getElementById('bulk-move-modal').style.display = 'none'; window.limparSelecaoPedidos(); window.showToast("Pedidos movidos!"); }
window.abrirBulkPayment = function() { document.getElementById('bulk-payment-modal').style.display = 'flex'; }
window.executarBulkPayment = async function() { const nS = document.getElementById('bulk-payment-select').value; window.mostrarLoading(true); await Promise.all(Array.from(window.ticketsSelecionados).map(id => updateDoc(doc(db, "pedidos", getPedidoDocumentoId(id)), { Status_Pagamento: nS }))); window.mostrarLoading(false); document.getElementById('bulk-payment-modal').style.display = 'none'; window.limparSelecaoPedidos(); window.showToast("Pagamentos atualizados!"); }
window.atualizarStatusPagamentoDireto = async function(id, sel) { window.mostrarLoading(true); try { await updateDoc(doc(db, "pedidos", getPedidoDocumentoId(id)), { Status_Pagamento: sel.value }); window.showToast("Pagamento Atualizado!"); } catch (err) { window.showToast("Erro ao salvar", true); } window.mostrarLoading(false); }

window.abrirModalEdicao = function(id) {
    const p = window.todosPedidos.find(x => x.ID_do_Pedido === id); if(!p) return;
    const tituloModalPedido = document.querySelector('#edit-modal-pedido .modal-header h3');
    if (tituloModalPedido) tituloModalPedido.textContent = 'Editar Pedido';
    window.editPedidoModoCopia = false;
    window.editPedidoIdCopiaOriginal = '';
    window.editPedidoStatusCopia = p.Status_do_Pedido || 'Pedidos Orçados';
    document.getElementById('modal-id-display').textContent = `#${id}`; document.getElementById('edit-id-pedido').value = id; document.getElementById('edit-nome-pedido').value = p.Nome_Cliente || ''; document.getElementById('edit-telefone-pedido').value = p.Numero || '';

    const dataPedidoInput = document.getElementById('edit-data-pedido');
    if (dataPedidoInput) dataPedidoInput.value = formatarDataParaInputPedido(p.Data_Entrega);

    const horaPedidoInput = document.getElementById('edit-hora-pedido');
    if (horaPedidoInput && horaPedidoInput.tagName === 'SELECT') garantirValorSelectPedido(horaPedidoInput, p.Horario_Entrega || '');
    else if (horaPedidoInput) horaPedidoInput.value = normalizarHoraPedidoManual(p.Horario_Entrega || '') || p.Horario_Entrega || '';

    const descontoManualExistente = extrairDescontoManualPedido(p.Cupom || '');
    const cupomSemDescontoManual = extrairCodigoCupomPedido(p.Cupom || '');
    document.getElementById('edit-forma-pedido').value = normalizarFormaPagamentoPedido(p.Forma_de_Pagamento || 'Pix');
    if (document.getElementById('edit-forma-pedido').value === 'Crédito') {
        const modalidadeLegada = getModalidadeCreditoPedido(p).toLowerCase();
        if (modalidadeLegada.includes('link')) document.getElementById('edit-forma-pedido').value = 'Crédito Link';
        else if (modalidadeLegada.includes('retirada')) document.getElementById('edit-forma-pedido').value = 'Crédito Retirada';
    } document.getElementById('edit-status-pgto-pedido').value = normalizarStatusPagamentoPedido(p.Status_Pagamento || 'Pendente'); document.getElementById('edit-cupom-pedido').value = cupomSemDescontoManual; document.getElementById('edit-total-pedido').value = p.Total_Final || ''; document.getElementById('edit-obs-pedido').value = p.Observacoes || ''; document.getElementById('edit-resumo-pedido').value = p.Resumo_dos_Itens || '';
    const cupomStatusEdit = document.getElementById('edit-cupom-status');
    if (cupomStatusEdit) { cupomStatusEdit.textContent = ''; cupomStatusEdit.className = 'edit-cupom-status'; }
    window.editCupomPedidoOriginal = cupomSemDescontoManual;
    window.editCupomAplicado = null;
    preencherDescontoManualEditPedido(descontoManualExistente);
    window.preencherSelectProdutosAdicionais();
    window.carregarItensEditPedido(p.Resumo_dos_Itens || '');
    window.inicializarNovosItensPedidoEditado();
    window.openModal('edit-modal-pedido');
}


window.editPedidoItens = [];
window.editPedidoNovosItens = [];
window.editPedidoModoCopia = false;
window.editPedidoIdCopiaOriginal = '';
window.editPedidoStatusCopia = 'Pedidos Orçados';
window.editCupomAplicado = null;
window.editCupomPedidoOriginal = '';
window.editDescontoManualAplicado = 0;

function gerarIdItemEditPedido() {
    return `edititem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizarTextoPedido(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function encontrarProdutoPorTextoPedido(nome) {
    const alvo = normalizarTextoPedido(nome);
    if (!alvo) return null;

    return allProducts.find(p => {
        const nomeProduto = normalizarTextoPedido(p.nome);
        const resumo = normalizarTextoPedido(p.descricaoResumo);
        const tamanho = normalizarTextoPedido(p.tamanho);
        const composto = normalizarTextoPedido(`${p.nome || ''} ${p.tamanho || ''}`);
        return alvo === nomeProduto || alvo === resumo || alvo === composto || (tamanho && alvo === `${nomeProduto} - ${tamanho}`);
    }) || allProducts.find(p => {
        const nomeProduto = normalizarTextoPedido(p.nome);
        const resumo = normalizarTextoPedido(p.descricaoResumo);
        return (nomeProduto && alvo.includes(nomeProduto)) || (resumo && alvo.includes(resumo));
    }) || null;
}

function parseResumoEditPedido(texto) {
    const itens = [];
    let categoriaAtual = 'Sem categoria';

    String(texto || '').split(/\r?\n/).forEach(linhaOriginal => {
        const linha = normalizarLinhaResumoPedido(linhaOriginal);
        if (!linha) return;

        const semDoisPontos = linha.replace(/:$/, '').trim();
        const pareceCategoria = !/\d+\s*(?:x|un|un\.|unidade|unidades)/i.test(linha) && !/R\$/i.test(linha);
        if ((linha.endsWith(':') || pareceCategoria) && semDoisPontos && semDoisPontos.length <= 60) {
            categoriaAtual = semDoisPontos;
            return;
        }

        if (/desconto|valor dos itens|total|bruto|liquido|líquido/i.test(linha)) return;

        let qtd = 0;
        let nome = linha;
        let preco = 0;
        let m = linha.match(/^(\d+)\s*(?:x|un\.?|unidades?)?\s*[-–]?\s*(.+)$/i);
        if (m) {
            qtd = parseInt(m[1], 10) || 0;
            nome = m[2].trim();
        } else {
            return;
        }

        const totalMatch = nome.match(/=\s*R\$\s*([\d.,]+)/i);
        const totalLinha = totalMatch ? converterValorParaNumero(totalMatch[1]) : 0;
        nome = nome.replace(/=\s*R\$\s*[\d.,]+/i, '').trim();

        const precoMatch = nome.match(/\(R\$\s*([\d.,]+)\s*(?:cada)?\)/i);
        if (precoMatch) {
            preco = converterValorParaNumero(precoMatch[1]);
            nome = nome.replace(/\(R\$\s*[\d.,]+\s*(?:cada)?\)/i, '').trim();
        }

        nome = nome.replace(/\s*-\s*$/g, '').trim();
        if (!preco && totalLinha && qtd) preco = totalLinha / qtd;

        const produto = encontrarProdutoPorTextoPedido(nome);
        itens.push({
            id: gerarIdItemEditPedido(),
            produtoId: produto ? produto.id : '__OUTROS__',
            nome: produto ? (produto.tamanho ? `${produto.nome} - ${produto.tamanho}` : produto.nome) : nome,
            categoria: produto ? (produto.categoria || 'Geral') : (categoriaAtual || 'Outros'),
            qtd: qtd || 1,
            preco: produto ? (converterValorParaNumero(produto.preco) || preco || 0) : (preco || 0),
            outros: !produto
        });
    });

    return itens;
}

function montarOptionsProdutosEditPedido(selectedId) {
    let html = '<option value="">Selecione...</option><option value="__OUTROS__" ' + (selectedId === '__OUTROS__' ? 'selected' : '') + '>Outros</option>';
    [...allProducts].sort(sortProducts).forEach(p => {
        const nome = p.tamanho ? `${p.nome} - ${p.tamanho}` : p.nome;
        html += `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${nome}</option>`;
    });
    return html;
}

function getProdutoEditPedido(id) {
    return allProducts.find(p => p.id === id) || null;
}

function getSubtotalEditPedido() {
    return window.editPedidoItens.reduce((acc, item) => acc + ((parseInt(item.qtd) || 0) * (parseFloat(item.preco) || 0)), 0);
}

function getDescontoManualEditPedido() {
    const campo = document.getElementById('edit-desconto-pedido');
    return Math.max(0, Math.abs(converterValorParaNumero(campo?.value || '0')) || 0);
}

function atualizarResumoHiddenEditPedido() {
    const grupos = {};
    window.editPedidoItens.forEach(item => {
        const qtd = parseInt(item.qtd) || 0;
        const preco = parseFloat(item.preco) || 0;
        const nome = (item.nome || '').trim();
        if (!qtd || !nome) return;

        const categoria = item.categoria || 'Sem categoria';
        if (!grupos[categoria]) grupos[categoria] = [];
        grupos[categoria].push(`${qtd} un. - ${nome} (R$ ${preco.toFixed(2).replace('.', ',')}) = R$ ${(qtd * preco).toFixed(2).replace('.', ',')}`);
    });

    let texto = '';
    Object.keys(grupos).forEach(cat => {
        texto += `- ${cat}:\n`;
        texto += grupos[cat].join('\n') + '\n\n';
    });

    const cupomDesc = window.editCupomAplicado?.desconto || 0;
    const codigoCupomAplicado = window.editCupomAplicado?.codigo || '';
    const descontoManualAplicado = window.editDescontoManualAplicado || 0;
    const descontoTotal = cupomDesc + descontoManualAplicado;

    if (codigoCupomAplicado || descontoTotal > 0) {
        texto += '- Descontos:\n';
        if (codigoCupomAplicado) texto += `Cupom: ${codigoCupomAplicado}\n`;
        if (descontoTotal > 0) texto += `Desconto: -R$ ${formatarNumeroMoedaPedido(descontoTotal)}\n`;
    }

    const hidden = document.getElementById('edit-resumo-pedido');
    if (hidden) hidden.value = texto.trim();
}

window.recalcularPedidoEditado = function() {
    const subtotal = getSubtotalEditPedido();
    const cupomDesc = window.editCupomAplicado?.desconto || 0;
    const descontoManual = getDescontoManualEditPedido();
    window.editDescontoManualAplicado = descontoManual;
    const total = Math.max(0, subtotal - cupomDesc - descontoManual);
    const totalEl = document.getElementById('edit-total-pedido');
    if (totalEl) totalEl.value = formatarNumeroMoedaPedido(total);
    atualizarResumoHiddenEditPedido();
};

window.renderItensPedidoEdit = function() {
    const container = document.getElementById('edit-itens-pedido-list');
    if (!container) return;

    if (!window.editPedidoItens.length) {
        container.innerHTML = '<div style="font-family:var(--font-numbers); color:#777; text-align:center; padding:10px;">Nenhum item no pedido.</div>';
        window.recalcularPedidoEditado();
        return;
    }

    let html = '';
    let categoriaAtual = null;

    const itensOrdenados = [...window.editPedidoItens].sort((a, b) => {
        const cat = (a.categoria || 'Sem categoria').localeCompare(b.categoria || 'Sem categoria', 'pt-BR');
        if (cat !== 0) return cat;
        return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    });

    itensOrdenados.forEach(item => {
        const categoria = item.categoria || 'Sem categoria';
        if (categoria !== categoriaAtual) {
            categoriaAtual = categoria;
            html += `<div class="edit-item-category">${categoria}</div>`;
        }

        const total = (parseInt(item.qtd) || 0) * (parseFloat(item.preco) || 0);
        html += `
            <div class="edit-item-row" data-id="${item.id}">
                <div class="edit-item-product-cell">
                    <select onchange="window.atualizarItemPedidoSelect('${item.id}', this.value)">${montarOptionsProdutosEditPedido(item.produtoId)}</select>
                    <input class="edit-outros-name" type="text" value="${String(item.nome || '').replace(/"/g, '&quot;')}" placeholder="Nome do item" ${item.outros ? '' : 'readonly style="display:none;"'} oninput="window.atualizarItemPedidoCampo('${item.id}', 'nome', this.value)">
                </div>
                <div>
                    <label>Unid.</label>
                    <input type="number" min="1" value="${parseInt(item.qtd) || 1}" oninput="window.atualizarItemPedidoCampo('${item.id}', 'qtd', this.value)">
                </div>
                <div>
                    <label>Valor Unid.</label>
                    <input type="number" step="0.01" min="0" value="${(parseFloat(item.preco) || 0).toFixed(2)}" ${item.outros ? '' : 'readonly'} oninput="window.atualizarItemPedidoCampo('${item.id}', 'preco', this.value)">
                </div>
                <div class="edit-item-total-cell">
                    <label>Total</label>
                    <input class="edit-item-total" type="text" value="R$ ${formatarNumeroMoedaPedido(total)}" readonly>
                </div>
                <div>
                    <label>&nbsp;</label>
                    <button type="button" class="btn btn-danger edit-item-remove" onclick="window.removerItemPedidoEdit('${item.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });

    const cupomAplicadoCodigo = (
        window.editCupomAplicado?.codigo ||
        (document.getElementById('edit-cupom-pedido')?.value || '').trim().toUpperCase()
    );
    const cupomDesconto = window.editCupomAplicado?.desconto || 0;
    const descontoManual = window.editDescontoManualAplicado || 0;
    const descontoTotal = cupomDesconto + descontoManual;

    if (cupomAplicadoCodigo || descontoTotal > 0) {
        let descontoHtml = '';
        if (cupomAplicadoCodigo) {
            descontoHtml += `<div class="edit-discount-row">Cupom: ${escapeHtmlPedido(cupomAplicadoCodigo)}</div>`;
        }
        if (descontoTotal > 0) {
            descontoHtml += `<div class="edit-discount-row">Desconto aplicado: -R$ ${formatarNumeroMoedaPedido(descontoTotal)}</div>`;
        }
        html += descontoHtml;
    }

    container.innerHTML = html;
    window.recalcularPedidoEditado();
};

window.carregarItensEditPedido = function(resumo) {
    window.editPedidoItens = parseResumoEditPedido(resumo);
    if (!window.editPedidoItens.length && resumo && resumo.trim()) {
        window.editPedidoItens = [{
            id: gerarIdItemEditPedido(),
            produtoId: '__OUTROS__',
            nome: 'Itens do pedido',
            categoria: 'Outros',
            qtd: 1,
            preco: converterValorParaNumero(document.getElementById('edit-total-pedido')?.value || '0'),
            outros: true
        }];
    }
    window.renderItensPedidoEdit();
};

window.preencherSelectProdutosAdicionais = function() {
    // Mantida por compatibilidade: as opções agora são montadas em cada linha de "Itens do Pedido".
};

window.toggleCamposOutros = function() {
    // Mantida por compatibilidade com versões anteriores do modal.
};

window.atualizarItemPedidoSelect = function(itemId, produtoId) {
    const item = window.editPedidoItens.find(i => i.id === itemId);
    if (!item) return;

    if (produtoId === '__OUTROS__') {
        item.produtoId = '__OUTROS__';
        item.outros = true;
        item.categoria = item.categoria || 'Outros';
        item.nome = item.nome || '';
        item.preco = parseFloat(item.preco) || 0;
    } else {
        const produto = getProdutoEditPedido(produtoId);
        if (!produto) return;
        item.produtoId = produto.id;
        item.outros = false;
        item.nome = produto.tamanho ? `${produto.nome} - ${produto.tamanho}` : produto.nome;
        item.categoria = produto.categoria || 'Geral';
        item.preco = converterValorParaNumero(produto.preco) || 0;
    }

    window.editCupomAplicado = null;
    const status = document.getElementById('edit-cupom-status');
    if (status) { status.textContent = ''; status.className = 'edit-cupom-status'; }
    window.renderItensPedidoEdit();
};

window.atualizarItemPedidoCampo = function(itemId, campo, valor) {
    const item = window.editPedidoItens.find(i => i.id === itemId);
    if (!item) return;

    if (campo === 'qtd') item.qtd = Math.max(1, parseInt(valor) || 1);
    else if (campo === 'preco') item.preco = Math.max(0, converterValorParaNumero(valor) || 0);
    else if (campo === 'nome') item.nome = valor;

    if (campo === 'qtd' || campo === 'preco') {
        window.renderItensPedidoEdit();
    } else {
        window.recalcularPedidoEditado();
    }
};

window.removerItemPedidoEdit = function(itemId) {
    window.editPedidoItens = window.editPedidoItens.filter(i => i.id !== itemId);
    window.renderItensPedidoEdit();
};

function criarNovoItemPendenteEditPedido() {
    return {
        id: gerarIdItemEditPedido(),
        produtoId: '',
        nome: '',
        categoria: 'Outros',
        qtd: 1,
        preco: 0,
        outros: false
    };
}

window.inicializarNovosItensPedidoEditado = function() {
    window.editPedidoNovosItens = [criarNovoItemPendenteEditPedido()];
    window.renderNovosItensPedidoEdit();
};

window.renderNovosItensPedidoEdit = function() {
    const container = document.getElementById('edit-novos-itens-list');
    if (!container) return;

    if (!window.editPedidoNovosItens.length) {
        window.editPedidoNovosItens = [criarNovoItemPendenteEditPedido()];
    }

    let html = '';
    window.editPedidoNovosItens.forEach((item, index) => {
        const total = (parseInt(item.qtd) || 0) * (parseFloat(item.preco) || 0);
        const mostrarNomeOutros = item.produtoId === '__OUTROS__' || item.outros;

        html += `
            <div class="edit-novo-item-row" data-id="${item.id}">
                <div class="edit-novo-item-product-cell">
                    <select onchange="window.atualizarNovoItemPedidoSelect('${item.id}', this.value)">${montarOptionsProdutosEditPedido(item.produtoId)}</select>
                    <input class="edit-outros-name" type="text" value="${String(item.nome || '').replace(/"/g, '&quot;')}" placeholder="Nome do item" ${mostrarNomeOutros ? '' : 'readonly style="display:none;"'} oninput="window.atualizarNovoItemPedidoCampo('${item.id}', 'nome', this.value)">
                </div>
                <div>
                    <label>Unid.</label>
                    <input type="number" min="1" value="${parseInt(item.qtd) || 1}" oninput="window.atualizarNovoItemPedidoCampo('${item.id}', 'qtd', this.value)">
                </div>
                <div>
                    <label>Valor Unid.</label>
                    <input type="number" step="0.01" min="0" value="${(parseFloat(item.preco) || 0).toFixed(2)}" ${mostrarNomeOutros ? '' : 'readonly'} oninput="window.atualizarNovoItemPedidoCampo('${item.id}', 'preco', this.value)">
                </div>
                <div>
                    <label>Total</label>
                    <input class="edit-item-total edit-novo-item-total" type="text" value="R$ ${formatarNumeroMoedaPedido(total)}" readonly>
                </div>
                <div>
                    <label>&nbsp;</label>
                    <button type="button" class="btn edit-novo-item-confirm" onclick="window.confirmarNovoItemPedidoEdit('${item.id}')" title="Adicionar item"><i class="fas fa-check"></i></button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
};

window.adicionarLinhaNovoItemPedido = function() {
    window.editPedidoNovosItens.push(criarNovoItemPendenteEditPedido());
    window.renderNovosItensPedidoEdit();
};

window.adicionarItemAoResumoPedido = function() {
    window.adicionarLinhaNovoItemPedido();
};

window.atualizarNovoItemPedidoSelect = function(itemId, produtoId) {
    const item = window.editPedidoNovosItens.find(i => i.id === itemId);
    if (!item) return;

    if (!produtoId) {
        item.produtoId = '';
        item.outros = false;
        item.nome = '';
        item.categoria = 'Outros';
        item.preco = 0;
    } else if (produtoId === '__OUTROS__') {
        item.produtoId = '__OUTROS__';
        item.outros = true;
        item.categoria = 'Outros';
        item.nome = '';
        item.preco = 0;
    } else {
        const produto = getProdutoEditPedido(produtoId);
        if (!produto) return;
        item.produtoId = produto.id;
        item.outros = false;
        item.nome = produto.tamanho ? `${produto.nome} - ${produto.tamanho}` : produto.nome;
        item.categoria = produto.categoria || 'Geral';
        item.preco = converterValorParaNumero(produto.preco) || 0;
    }

    window.renderNovosItensPedidoEdit();
};

window.atualizarNovoItemPedidoCampo = function(itemId, campo, valor) {
    const item = window.editPedidoNovosItens.find(i => i.id === itemId);
    if (!item) return;

    if (campo === 'qtd') item.qtd = Math.max(1, parseInt(valor) || 1);
    else if (campo === 'preco') item.preco = Math.max(0, converterValorParaNumero(valor) || 0);
    else if (campo === 'nome') item.nome = valor;

    if (campo === 'qtd' || campo === 'preco') {
        window.renderNovosItensPedidoEdit();
    }
};

window.removerNovoItemPedidoEdit = function(itemId) {
    window.editPedidoNovosItens = window.editPedidoNovosItens.filter(i => i.id !== itemId);
    if (!window.editPedidoNovosItens.length) window.editPedidoNovosItens = [criarNovoItemPendenteEditPedido()];
    window.renderNovosItensPedidoEdit();
};

function isNovoItemPedidoVazio(item) {
    return !item || (!item.produtoId && !String(item.nome || '').trim() && !(parseFloat(item.preco) > 0));
}

function validarNovoItemPedidoPendente(item) {
    if (isNovoItemPedidoVazio(item)) {
        window.showToast("Preencha o item antes de adicionar.", true);
        return null;
    }

    if (!item.produtoId) {
        window.showToast("Selecione o item antes de adicionar.", true);
        return null;
    }

    if ((item.produtoId === '__OUTROS__' || item.outros) && !String(item.nome || '').trim()) {
        window.showToast("Informe o nome do item em Outros antes de adicionar.", true);
        return null;
    }

    const qtd = Math.max(1, parseInt(item.qtd) || 1);
    const preco = Math.max(0, parseFloat(item.preco) || 0);

    if (item.produtoId === '__OUTROS__' && preco <= 0) {
        window.showToast("Informe o valor unitário do item em Outros antes de adicionar.", true);
        return null;
    }

    return {
        id: gerarIdItemEditPedido(),
        produtoId: item.produtoId,
        nome: item.nome,
        categoria: item.produtoId === '__OUTROS__' ? 'Outros' : (item.categoria || 'Geral'),
        qtd,
        preco,
        outros: item.produtoId === '__OUTROS__' || item.outros
    };
}

window.confirmarNovoItemPedidoEdit = function(itemId) {
    const item = window.editPedidoNovosItens.find(i => i.id === itemId);
    const itemValidado = validarNovoItemPedidoPendente(item);
    if (!itemValidado) return;

    window.editPedidoItens.push(itemValidado);
    window.editPedidoNovosItens = window.editPedidoNovosItens.filter(i => i.id !== itemId);
    if (!window.editPedidoNovosItens.length) {
        window.editPedidoNovosItens = [criarNovoItemPendenteEditPedido()];
    }

    window.renderItensPedidoEdit();
    window.renderNovosItensPedidoEdit();
    window.showToast("Item adicionado ao pedido!");
};

function incorporarNovosItensPedidoEditado() {
    const pendentesPreenchidos = (window.editPedidoNovosItens || []).filter(item => !isNovoItemPedidoVazio(item));

    if (pendentesPreenchidos.length) {
        window.showToast("Clique no check para adicionar o item antes de salvar.", true);
        return false;
    }

    return true;
};

window.onInputDescontoEditPedido = function() {
    const valorDigitado = getDescontoManualEditPedido();
    const status = document.getElementById('edit-desconto-status');

    window.editDescontoManualAplicado = valorDigitado;

    if (status) {
        if (valorDigitado > 0) {
            status.textContent = `Desconto aplicado: -R$ ${formatarNumeroMoedaPedido(valorDigitado)}`;
            status.className = 'edit-cupom-status ok';
        } else {
            status.textContent = '';
            status.className = 'edit-cupom-status';
        }
    }

    window.recalcularPedidoEditado();
};

window.aplicarDescontoManualEditPedido = function() {
    const valor = getDescontoManualEditPedido();
    const status = document.getElementById('edit-desconto-status');

    window.editDescontoManualAplicado = valor;

    if (status) {
        if (valor > 0) {
            status.textContent = `Desconto aplicado: -R$ ${formatarNumeroMoedaPedido(valor)}`;
            status.className = 'edit-cupom-status ok';
        } else {
            status.textContent = '';
            status.className = 'edit-cupom-status';
        }
    }

    window.renderItensPedidoEdit();
    window.recalcularPedidoEditado();
};

window.resetarCupomEditPedido = function() {
    window.editCupomAplicado = null;
    const status = document.getElementById('edit-cupom-status');
    if (status) { status.textContent = ''; status.className = 'edit-cupom-status'; }
    window.renderItensPedidoEdit();
    window.recalcularPedidoEditado();
};

window.validarCupomEditPedido = async function() {
    const input = document.getElementById('edit-cupom-pedido');
    const status = document.getElementById('edit-cupom-status');
    const codigo = (input?.value || '').trim().toUpperCase();
    const subtotal = getSubtotalEditPedido();

    window.editCupomAplicado = null;
    if (status) { status.textContent = ''; status.className = 'edit-cupom-status'; }

    try {
        const resultado = await validarCupomAdmin(codigo, subtotal);
        if (!resultado.ok) {
            if (status) { status.textContent = resultado.motivo; status.className = 'edit-cupom-status erro'; }
            window.recalcularPedidoEditado();
            return;
        }

        window.editCupomAplicado = { codigo: resultado.codigo, desconto: resultado.desconto };
        if (input) input.value = resultado.codigo;
        if (status) {
            status.textContent = `Cupom aplicado: -R$ ${formatarNumeroMoedaPedido(resultado.desconto)}`;
            status.className = 'edit-cupom-status ok';
        }
        window.renderItensPedidoEdit();
        window.recalcularPedidoEditado();
    } catch (err) {
        console.error(err);
        if (status) { status.textContent = 'Erro ao validar cupom.'; status.className = 'edit-cupom-status erro'; }
        window.recalcularPedidoEditado();
    }
};



window.submitEditForm = async function(e) {
    e.preventDefault(); window.mostrarLoading(true);
    const id = document.getElementById('edit-id-pedido').value;
    const dt = document.getElementById('edit-data-pedido').value;
    const dataEntregaFormatada = dt ? formatarDataInputParaBR(dt) : "";
    const horaPedidoInput = document.getElementById('edit-hora-pedido');
    const horaEntregaFormatada = normalizarHoraPedidoManual(horaPedidoInput?.value || '');

    if (dt && !dataEntregaFormatada) {
        window.mostrarLoading(false);
        window.showToast("Data de entrega inválida.", true);
        return;
    }

    if (!horaEntregaFormatada) {
        window.mostrarLoading(false);
        window.showToast("Horário inválido. Use HH:MM, por exemplo 15:35.", true);
        return;
    }

    if (horaPedidoInput) horaPedidoInput.value = horaEntregaFormatada;

    if (!incorporarNovosItensPedidoEditado()) {
        window.mostrarLoading(false);
        return;
    }

    window.recalcularPedidoEditado();

    const cupomInputAtual = (document.getElementById('edit-cupom-pedido')?.value || '').trim().toUpperCase();
    const cupomOriginal = String(window.editCupomPedidoOriginal || '').trim().toUpperCase();
    const descontoCupom = window.editCupomAplicado?.desconto || 0;
    const codigoCupomAplicado = window.editCupomAplicado?.codigo || (cupomInputAtual && cupomInputAtual === cupomOriginal ? cupomOriginal : '');
    const descontoManual = getDescontoManualEditPedido();
    window.editDescontoManualAplicado = descontoManual;

    const descontoTotal = descontoCupom + descontoManual;
    const cupomFinal = montarCupomDescontoPedido(codigoCupomAplicado, descontoTotal);
    const formaPagamentoEdit = normalizarFormaPagamentoPedido(document.getElementById('edit-forma-pedido').value);
    const modalidadeCreditoEdit = getModalidadeCreditoPedido({ Forma_de_Pagamento: formaPagamentoEdit });

    const totalFinalCalculado = formatarNumeroMoedaPedido(
        Math.max(0, getSubtotalEditPedido() - descontoCupom - descontoManual)
    );
    const dadosTaxaPagamentoEdit = montarDadosTaxaPagamento({
        Forma_de_Pagamento: formaPagamentoEdit,
        Modalidade_Credito: modalidadeCreditoEdit,
        Total_Final: totalFinalCalculado,
        Resumo_dos_Itens: document.getElementById('edit-resumo-pedido')?.value || '',
        Cupom: cupomFinal
    });
    const totalPedidoInput = document.getElementById('edit-total-pedido');
    if (totalPedidoInput) totalPedidoInput.value = totalFinalCalculado;

    try {
        const dadosPedidoEditado = {
            Nome_Cliente: document.getElementById('edit-nome-pedido').value,
            Numero: document.getElementById('edit-telefone-pedido').value,
            Data_Entrega: dataEntregaFormatada,
            Horario_Entrega: horaEntregaFormatada,
            Total_Final: totalFinalCalculado,
            Forma_de_Pagamento: formaPagamentoEdit,
            Modalidade_Credito: modalidadeCreditoEdit,
            ...dadosTaxaPagamentoEdit,
            Status_Pagamento: document.getElementById('edit-status-pgto-pedido').value,
            Cupom: cupomFinal,
            Observacoes: document.getElementById('edit-obs-pedido').value,
            Resumo_dos_Itens: document.getElementById('edit-resumo-pedido').value,
            updatedAt: Date.now()
        };

        if (window.editPedidoModoCopia) {
            await setDoc(doc(db, "pedidos", id), {
                ...dadosPedidoEditado,
                ID_do_Pedido: id,
                Status_do_Pedido: 'Pedidos Orçados',
                origem: 'copia',
                idOriginal: window.editPedidoIdCopiaOriginal || '',
                createdAt: Date.now()
            });
            await ajustarUsoCupomPedidoEditado('', codigoCupomAplicado, true);
            const pedidoCopiadoLocal = {
                ...dadosPedidoEditado,
                ID_do_Pedido: id,
                Status_do_Pedido: 'Pedidos Orçados',
                origem: 'copia',
                idOriginal: window.editPedidoIdCopiaOriginal || '',
                createdAt: Date.now()
            };
            const idxCopia = window.todosPedidos.findIndex(p => p.ID_do_Pedido === id || p._docId === id);
            if (idxCopia >= 0) window.todosPedidos[idxCopia] = { ...window.todosPedidos[idxCopia], ...pedidoCopiadoLocal };
            else window.todosPedidos.push(pedidoCopiadoLocal);

            window.editPedidoModoCopia = false;
            window.editPedidoIdCopiaOriginal = '';
            window.showToast("Pedido copiado!");
        } else {
            await updateDoc(doc(db, "pedidos", getPedidoDocumentoId(id)), dadosPedidoEditado);
            await ajustarUsoCupomPedidoEditado(cupomOriginal, codigoCupomAplicado, false);

            const idxPedido = window.todosPedidos.findIndex(p => p.ID_do_Pedido === id || p._docId === id);
            if (idxPedido >= 0) {
                window.todosPedidos[idxPedido] = { ...window.todosPedidos[idxPedido], ...dadosPedidoEditado };
            }

            window.showToast("Salvo!");
        }

        window.filtrarPedidos();
        window.fecharModalPedido('edit-modal-pedido');
    } catch (err) {
        console.error(err);
        window.showToast("Erro ao salvar!", true);
    }
    window.mostrarLoading(false);
}

function getPedidosSelecionadosOuFiltrados() {
    const selecionados = window.todosPedidos.filter(p => window.ticketsSelecionados.has(p.ID_do_Pedido));
    if (selecionados.length > 0) return selecionados;
    return window.obterPedidosFiltrados();
}

function getDescricaoFiltroAtualPedidos() {
    const displayData = document.getElementById('date-filter-display')?.value || '';
    const busca = document.getElementById('search-input-pedidos')?.value.trim() || '';
    const partes = [];
    if (displayData) partes.push(`Data: ${displayData}`);
    if (busca) partes.push(`Busca: ${busca}`);
    return partes.length ? partes.join(' | ') : 'Filtros atuais';
}

function normalizarLinhaResumoPedido(linha) {
    return String(linha || '')
        .replace(/[*_`]/g, '')
        .replace(/^[•\-–]\s*/, '')
        .trim();
}

function extrairItensResumoPedido(texto) {
    const itens = [];
    let categoriaAtual = 'Sem categoria';
    String(texto || '').split(/\r?\n/).forEach(linhaOriginal => {
        const linha = normalizarLinhaResumoPedido(linhaOriginal);
        if (!linha) return;

        const semDoisPontos = linha.replace(/:$/, '').trim();
        const pareceCategoria = !/\d+\s*(?:x|un|un\.|unidade|unidades)/i.test(linha) && !/R\$/i.test(linha);
        if ((linha.endsWith(':') || pareceCategoria) && semDoisPontos.length > 0 && semDoisPontos.length <= 60) {
            categoriaAtual = semDoisPontos;
            return;
        }

        if (/desconto|valor dos itens|total|bruto|liquido|líquido/i.test(linha)) return;

        let qtd = 0;
        let nome = linha;
        let preco = 0;
        let total = 0;

        let m = linha.match(/^(\d+)\s*(?:x|un\.?|unidades?)?\s*[-–]?\s*(.+)$/i);
        if (m) {
            qtd = parseInt(m[1], 10) || 0;
            nome = m[2].trim();
        }

        const totalMatch = nome.match(/=\s*R\$\s*([\d.,]+)/i);
        if (totalMatch) {
            total = converterValorParaNumero(totalMatch[1]);
            nome = nome.replace(/=\s*R\$\s*[\d.,]+/i, '').trim();
        }

        const precoMatch = nome.match(/\(R\$\s*([\d.,]+)\s*(?:cada)?\)/i);
        if (precoMatch) {
            preco = converterValorParaNumero(precoMatch[1]);
            nome = nome.replace(/\(R\$\s*[\d.,]+\s*(?:cada)?\)/i, '').trim();
        }

        nome = nome.replace(/\s*-\s*$/g, '').trim();
        if (!qtd || !nome) return;
        if (!preco && total && qtd) preco = total / qtd;
        if (!total && preco && qtd) total = preco * qtd;

        itens.push({
            categoria: categoriaAtual || 'Sem categoria',
            nome,
            qtd,
            preco,
            total
        });
    });
    return itens;
}

window.abrirModalResumos = function() {
    const pedidosResumo = getPedidosSelecionadosOuFiltrados();
    if (pedidosResumo.length === 0) return window.showToast("Nenhum pedido no período/filtro atual.", true);
    document.getElementById('resumos-modal').style.display = 'flex';
}

window.gerarListaPedidos = function() {
    const sel = getPedidosSelecionadosOuFiltrados();
    if(sel.length === 0) return window.showToast("Nenhum pedido para listar.", true);

    let t = `Resumo ${sel.length} Pedido(s) - ${getDescricaoFiltroAtualPedidos()}:\n\n`;
    ordenarPedidosPorDataHorario([...sel]).forEach((p, i) => {
        t += `Pedido ${i + 1}\n\n* ${p.Nome_Cliente}\n   ⤷ ${p.Data_Entrega || '--/--/----'} às ${p.Horario_Entrega || '--:--'}\n   ⤷ ${p.ID_do_Pedido}\n\n*- Itens:*\n\n${p.Resumo_dos_Itens ? p.Resumo_dos_Itens : 'Sem itens descritos'}\n\n*Total:* R$ ${formatarValorComCentavos(p.Total_Final)}\n\n------------------------------------------\n\n`;
    });

    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank');
    document.getElementById('resumos-modal').style.display = 'none';
}

window.gerarResumoItens = function() {
    const pedidos = getPedidosSelecionadosOuFiltrados();
    if (pedidos.length === 0) return window.showToast("Nenhum pedido para agrupar.", true);

    const agrupados = {};
    pedidos.forEach(p => {
        extrairItensResumoPedido(p.Resumo_dos_Itens || '').forEach(item => {
            const cat = item.categoria || 'Sem categoria';
            const chave = `${cat}|||${item.nome.toLowerCase()}|||${Number(item.preco || 0).toFixed(2)}`;
            if (!agrupados[cat]) agrupados[cat] = {};
            if (!agrupados[cat][chave]) agrupados[cat][chave] = { ...item, qtd: 0, total: 0 };
            agrupados[cat][chave].qtd += item.qtd;
            agrupados[cat][chave].total += item.total || (item.preco * item.qtd);
        });
    });

    let t = `Lista de Itens - ${pedidos.length} pedido(s) - ${getDescricaoFiltroAtualPedidos()}\n\n`;
    Object.keys(agrupados).sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(cat => {
        const itens = Object.values(agrupados[cat]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const totalCategoria = itens.reduce((acc, item) => acc + item.qtd, 0);
        t += `*${cat}* (${totalCategoria} itens)\n`;
        itens.forEach(item => {
            const precoInfo = item.preco ? ` (R$ ${formatarValorComCentavos(item.preco)} cada)` : '';
            const totalInfo = item.total ? ` = R$ ${formatarValorComCentavos(item.total)}` : '';
            t += `- ${item.qtd} un. - ${item.nome}${precoInfo}${totalInfo}\n`;
        });
        t += `\n`;
    });

    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank');
    document.getElementById('resumos-modal').style.display = 'none';
}


window.abrirModalWhatsApp = function(id) {
    const p = window.todosPedidos.find(x => x.ID_do_Pedido === id); if (!p) return; window.pedidoWhatsAppAtual = id;
    const n = (p.Nome_Cliente || 'Cliente').trim().split(' ')[0];
    document.getElementById('whatsapp-confirm-title').textContent = `Contato com ${n}`;
    document.getElementById('whatsapp-confirm-message').innerHTML = `<div style="display: flex; flex-direction: column; gap: 10px; margin: 20px 0;"><button class="btn btn-primary" onclick="window.confirmarEnvioWhatsApp('resumo')" style="width: 100%; justify-content:center;">Enviar resumo</button><button class="btn btn-secondary" onclick="window.confirmarEnvioWhatsApp('contato')" style="width: 100%; justify-content:center;">Entrar em contato</button><button class="btn btn-outline" onclick="window.confirmarEnvioWhatsApp('pronto')" style="width: 100%; border-color:#28a745; color:#28a745; justify-content:center;">Pedido Pronto</button></div>`;
    document.getElementById('whatsapp-confirm-modal').style.display = 'flex';
}

window.confirmarEnvioWhatsApp = async function(m) {
    const p = window.todosPedidos.find(x => x.ID_do_Pedido === window.pedidoWhatsAppAtual); if (!p) return;
    let num = p.Numero ? p.Numero.replace(/\D/g, '') : ''; if(num.length >= 10 && !num.startsWith('55')) num = '55' + num;
    const n = (p.Nome_Cliente || 'Cliente').trim().split(' ')[0]; let t = '';
    if (m === 'resumo') { t = `*Olá ${n}!*\n\n*Resumo do Pedido ${p.ID_do_Pedido}*\n\n*Data de Entrega:* ${p.Data_Entrega || '--/--/----'}\n*Horário:* ${p.Horario_Entrega || '--:--'}\n\n${p.Resumo_dos_Itens ? `*Itens:*\n${p.Resumo_dos_Itens}\n\n` : ''}*Total:* R$ ${formatarValorComCentavos(p.Total_Final)}\n*Forma de Pagamento:* ${p.Forma_de_Pagamento || 'Não informado'}`; } 
    else if (m === 'pronto') { window.mostrarLoading(true); try { await updateDoc(doc(db, "pedidos", p.ID_do_Pedido), { Status_do_Pedido: 'Retirada' }); } catch(e) {} window.mostrarLoading(false); t = `*Olá ${n}!*\n\nSeu pedido *${p.ID_do_Pedido}* está pronto para retirada!\n\n${p.Data_Entrega || '--/--/----'}\n${p.Horario_Entrega || '--:--'}\n\nAguardamos você!`; } 
    else { t = `Olá ${n}!`; }
    if(num) window.open(`https://wa.me/${num}?text=${encodeURIComponent(t)}`, '_blank'); document.getElementById('whatsapp-confirm-modal').style.display = 'none';
}

window.openDatePicker = function() {
    const displayManual = document.getElementById('date-filter-display')?.value || '';
    if (displayManual) sincronizarFiltroDataOcultoPeloDisplay(displayManual, false);
    const dF = document.getElementById('date-input').value;
    if (dF) { if (dF.includes(',')) { const [di, dFim] = dF.split(','); window.dataInicialIntervalo = new Date(parseInt(di.split('-')[0]), parseInt(di.split('-')[1]) - 1, parseInt(di.split('-')[2]), 0,0,0,0); window.dataFinalIntervalo = new Date(parseInt(dFim.split('-')[0]), parseInt(dFim.split('-')[1]) - 1, parseInt(dFim.split('-')[2]), 0,0,0,0); } else { window.dataInicialIntervalo = new Date(parseInt(dF.split('-')[0]), parseInt(dF.split('-')[1]) - 1, parseInt(dF.split('-')[2]), 0,0,0,0); window.dataFinalIntervalo = null; } } else { window.dataInicialIntervalo = null; window.dataFinalIntervalo = null; }
    document.getElementById('date-picker-modal').style.display = 'flex'; window.renderCalendar();
}
window.closeDatePicker = function() { document.getElementById('date-picker-modal').style.display = 'none'; }
window.renderCalendar = function() {
    const cg = document.getElementById('calendar-grid'); if(!cg) return;
    const y = window.currentCalendarDate.getFullYear(), m = window.currentCalendarDate.getMonth();
    document.getElementById('month-year-display').textContent = `${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][m]} ${y}`;
    cg.innerHTML = ''; ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(d => cg.innerHTML += `<div class="date-picker-weekday">${d}</div>`);
    const fD = new Date(y, m, 1).getDay(), dM = new Date(y, m + 1, 0).getDate();
    for(let i=0; i<fD; i++) cg.innerHTML += `<div class="date-picker-empty"></div>`;
    for(let d=1; d<=dM; d++) {
        const cD = new Date(y, m, d, 0,0,0,0), el = document.createElement('div'); el.className = 'date-picker-day'; el.textContent = d; el.onclick = (e) => { e.stopPropagation(); window.selecionarData(y, m, d); };
        if (cD.getTime() === new Date(new Date().setHours(0,0,0,0)).getTime()) el.classList.add('today');
        if (window.dataInicialIntervalo && window.dataFinalIntervalo) { if (cD.getTime() === window.dataInicialIntervalo.getTime()) el.classList.add('range-start'); else if (cD.getTime() === window.dataFinalIntervalo.getTime()) el.classList.add('range-end'); else if (cD >= window.dataInicialIntervalo && cD <= window.dataFinalIntervalo) el.classList.add('in-range'); } else if (window.dataInicialIntervalo && cD.getTime() === window.dataInicialIntervalo.getTime()) el.classList.add('selected');
        cg.appendChild(el);
    }
}
window.selecionarData = function(y, m, d) {
    const sD = new Date(y, m, d, 0,0,0,0);
    if (window.dataInicialIntervalo && window.dataFinalIntervalo) { window.dataInicialIntervalo = sD; window.dataFinalIntervalo = null; } else if (!window.dataInicialIntervalo) { window.dataInicialIntervalo = sD; window.dataFinalIntervalo = null; } else if (!window.dataFinalIntervalo) { if (sD < window.dataInicialIntervalo) { window.dataFinalIntervalo = new Date(window.dataInicialIntervalo); window.dataInicialIntervalo = sD; } else { if (sD.getTime() === window.dataInicialIntervalo.getTime()) { window.dataInicialIntervalo = null; window.dataFinalIntervalo = null; } else window.dataFinalIntervalo = sD; } }
    window.atualizarDisplayData(); window.renderCalendar();
}
window.atualizarDisplayData = function() {
    if (window.dataInicialIntervalo && window.dataFinalIntervalo) {
        document.getElementById('date-filter-display').value = `${String(window.dataInicialIntervalo.getDate()).padStart(2, '0')}/${String(window.dataInicialIntervalo.getMonth() + 1).padStart(2, '0')}/${window.dataInicialIntervalo.getFullYear()} - ${String(window.dataFinalIntervalo.getDate()).padStart(2, '0')}/${String(window.dataFinalIntervalo.getMonth() + 1).padStart(2, '0')}/${window.dataFinalIntervalo.getFullYear()}`;
        document.getElementById('date-input').value = `${window.dataInicialIntervalo.getFullYear()}-${String(window.dataInicialIntervalo.getMonth() + 1).padStart(2, '0')}-${String(window.dataInicialIntervalo.getDate()).padStart(2, '0')},${window.dataFinalIntervalo.getFullYear()}-${String(window.dataFinalIntervalo.getMonth() + 1).padStart(2, '0')}-${String(window.dataFinalIntervalo.getDate()).padStart(2, '0')}`;
    } else if (window.dataInicialIntervalo) {
        document.getElementById('date-filter-display').value = `${String(window.dataInicialIntervalo.getDate()).padStart(2, '0')}/${String(window.dataInicialIntervalo.getMonth() + 1).padStart(2, '0')}/${window.dataInicialIntervalo.getFullYear()}`;
        document.getElementById('date-input').value = `${window.dataInicialIntervalo.getFullYear()}-${String(window.dataInicialIntervalo.getMonth() + 1).padStart(2, '0')}-${String(window.dataInicialIntervalo.getDate()).padStart(2, '0')}`;
    } else { document.getElementById('date-filter-display').value = ''; document.getElementById('date-input').value = ''; }
}
window.aplicarFiltroData = function() { if (!window.dataInicialIntervalo) return window.showToast("Selecione uma data!", true); if (window.dataInicialIntervalo && !window.dataFinalIntervalo) window.dataFinalIntervalo = new Date(window.dataInicialIntervalo); window.atualizarDisplayData(); window.filtrarPedidos(); window.closeDatePicker(); }
window.selecionarHoje = function() { window.dataInicialIntervalo = new Date(new Date().setHours(0,0,0,0)); window.dataFinalIntervalo = null; window.atualizarDisplayData(); window.renderCalendar(); window.aplicarFiltroData(); }
window.filtrarMesAtual = function() { const hj = new Date(), mA = hj.getMonth(), aA = hj.getFullYear(); window.dataInicialIntervalo = new Date(aA, mA, 1, 0,0,0,0); window.dataFinalIntervalo = new Date(aA, mA + 1, 0, 0,0,0,0); window.atualizarDisplayData(); window.renderCalendar(); window.filtrarPedidos(); window.closeDatePicker(); }
window.limparFiltros = function() { document.getElementById('search-input-pedidos').value = ''; document.getElementById('date-input').value = ''; document.getElementById('date-filter-display').value = ''; document.getElementById('filter-status-pagamento').value = ''; document.getElementById('filter-forma-pagamento').value = ''; document.getElementById('filter-observacao').value = ''; window.dataInicialIntervalo = null; window.dataFinalIntervalo = null; window.filtrarPedidos(); }
window.mudarMes = function(delta) { window.currentCalendarDate.setMonth(window.currentCalendarDate.getMonth() + delta); window.renderCalendar(); }
window.fecharModalPedido = function(id) { document.getElementById(id).style.display = 'none'; }
window.mostrarLoading = function(show) { document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none'; }
window.showToast = function(msg, isError = false) { const t = document.getElementById('toast'); t.textContent = msg; t.style.backgroundColor = isError ? '#e74c3c' : '#28a745'; t.style.display = 'block'; setTimeout(() => { t.style.display = 'none'; }, 3000); }

// ==========================================
// MÓDULO DE ESTOQUE
// ==========================================
document.getElementById('search-estoque')?.addEventListener('input', () => { window.renderEstoqueTable(); });

async function loadEstoque() {
    const s = await getDocs(collection(db, "estoque"));
    allEstoque = [];
    s.forEach(d => allEstoque.push({id: d.id, ...d.data()}));
    window.renderEstoqueTable();
    window.checarAlertasEstoque();
}

window.renderEstoqueTable = function() {
    const tb = document.querySelector("#tbl-estoque tbody");
    if (!tb) return;
    tb.innerHTML = "";
    
    const searchInput = document.getElementById('search-estoque');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    let filtered = allEstoque.filter(e => `${e.nome} ${e.unidade}`.toLowerCase().includes(searchTerm));

    filtered.sort((a, b) => window.sortAlfabetico(a.nome, b.nome)).forEach(e => {
        const isBaixo = parseFloat(e.quantidadeAtual) <= parseFloat(e.quantidadeMinima);
        
        tb.innerHTML += `<tr>
            <td data-label="Insumo:"><strong style="color:var(--favu-rust); font-size:1.1rem;">${e.nome}</strong></td>
            <td data-label="Unidade:">${e.unidade}</td>
            <td data-label="Atual:"><strong style="color: ${isBaixo ? '#E60000' : 'var(--favu-moss)'};">${e.quantidadeAtual}</strong></td>
            <td data-label="Mínimo:">${e.quantidadeMinima}</td>
            <td data-label="Status:"><span class="badge ${isBaixo ? 'inativo' : 'ativo'}">${isBaixo ? 'Baixo / Faltando' : 'Suficiente'}</span></td>
            <td data-label="Ações:">
                <div class="action-btns-wrapper">
                    <button class="btn-action edit" onclick="window.openEditEstoque('${e.id}')"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn-action del" onclick="window.delEstoque('${e.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });
}

window.checarAlertasEstoque = function() {
    const alertaDiv = document.getElementById('alertas-estoque');
    const listaFaltas = document.getElementById('lista-faltas-estoque');
    if (!alertaDiv || !listaFaltas) return;

    listaFaltas.innerHTML = '';
    let temAlerta = false;

    allEstoque.forEach(e => {
        if (parseFloat(e.quantidadeAtual) <= parseFloat(e.quantidadeMinima)) {
            temAlerta = true;
            listaFaltas.innerHTML += `<li><strong>${e.nome}:</strong> Restam apenas ${e.quantidadeAtual} ${e.unidade} (Mínimo: ${e.quantidadeMinima})</li>`;
        }
    });

    alertaDiv.style.display = temAlerta ? 'block' : 'none';
}

const formAddEstoque = document.getElementById('form-add-estoque');
if (formAddEstoque) {
    formAddEstoque.onsubmit = async(e) => {
        e.preventDefault(); 
        const btn = e.target.querySelector('button[type="submit"]'); 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
        try {
            await addDoc(collection(db, "estoque"), {
                nome: document.getElementById('ae-nome').value.trim(),
                unidade: document.getElementById('ae-unidade').value,
                quantidadeAtual: parseFloat(document.getElementById('ae-atual').value) || 0,
                quantidadeMinima: parseFloat(document.getElementById('ae-minimo').value) || 0,
                custo_medio_por_unidade: 0
            });
            customAlert("Insumo Adicionado!");
            window.closeModal('modal-add-estoque', 'form-add-estoque');
            loadEstoque();
        } catch(err) { 
            customAlert("Erro ao salvar.", "Erro"); 
        } finally { 
            btn.innerHTML = 'Salvar Insumo'; btn.disabled = false; 
        }
    };
}

window.openEditEstoque = async(id) => {
    const e = (await getDoc(doc(db,"estoque", id))).data();
    document.getElementById('ee-id').value = id;
    document.getElementById('ee-nome').value = e.nome;
    document.getElementById('ee-unidade').value = e.unidade;
    document.getElementById('ee-atual').value = e.quantidadeAtual;
    document.getElementById('ee-minimo').value = e.quantidadeMinima;
    window.openModal('modal-edit-estoque');
};

const formEditEstoque = document.getElementById('form-edit-estoque');
if (formEditEstoque) {
    formEditEstoque.onsubmit = async(e) => {
        e.preventDefault(); 
        const btn = e.target.querySelector('button[type="submit"]'); 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true;
        try {
            await updateDoc(doc(db, "estoque", document.getElementById('ee-id').value), {
                nome: document.getElementById('ee-nome').value.trim(),
                unidade: document.getElementById('ee-unidade').value,
                quantidadeAtual: parseFloat(document.getElementById('ee-atual').value) || 0,
                quantidadeMinima: parseFloat(document.getElementById('ee-minimo').value) || 0,
            });
            customAlert("Insumo Atualizado!");
            window.closeModal('modal-edit-estoque', 'form-edit-estoque');
            loadEstoque();
        } catch(err) { 
            customAlert("Erro.", "Erro"); 
        } finally { 
            btn.innerHTML = 'Atualizar'; btn.disabled = false; 
        }
    };
}

window.delEstoque = async(id) => {
    customConfirm("Excluir este insumo permanentemente?", async () => {
        await deleteDoc(doc(db, "estoque", id));
        loadEstoque();
    });
};

window.registrarCompra = async function(insumoId, marca, quantidadeComprada, unidadeMedida, valorTotal) {
    try {
        let qtdConvertida = parseFloat(quantidadeComprada);
        if (unidadeMedida === 'Kg' || unidadeMedida === 'L') {
            qtdConvertida = qtdConvertida * 1000;
        }

        const custoDessaCompraPorBase = valorTotal / qtdConvertida;
        const insumoRef = doc(db, "estoque", insumoId);
        const insumoSnap = await getDoc(insumoRef);
        
        if (!insumoSnap.exists()) {
            customAlert("Insumo não encontrado no banco de dados.", "Erro");
            return;
        }
        
        const insumo = insumoSnap.data();
        const estoqueAntigo = parseFloat(insumo.quantidadeAtual) || 0;
        const custoMedioAntigo = parseFloat(insumo.custo_medio_por_unidade) || 0;
        const valorEmEstoque = estoqueAntigo * custoMedioAntigo;
        const estoqueNovoTotal = estoqueAntigo + qtdConvertida;
        const novoCustoMedio = (valorEmEstoque + valorTotal) / estoqueNovoTotal;

        await updateDoc(insumoRef, {
            quantidadeAtual: estoqueNovoTotal,
            custo_medio_por_unidade: novoCustoMedio
        });

        await addDoc(collection(db, "historico_compras"), {
            insumo_id: insumoId,
            marca: marca,
            data: Date.now(), 
            qtd_convertida: qtdConvertida,
            valor_total: valorTotal,
            unidade_compra: unidadeMedida,
            quantidade_comprada: quantidadeComprada
        });

        customAlert("Compra lançada e custo médio atualizado com sucesso!");
        loadEstoque(); 
    } catch (error) {
        console.error("Erro ao processar a compra: ", error);
        customAlert("Houve um erro ao registrar a compra.", "Erro");
    }
}

window.calcularCustoProduto = async function(produtoId, precoVendaProduto) {
    try {
        const fichaRef = doc(db, "fichas_tecnicas", produtoId);
        const fichaSnap = await getDoc(fichaRef);
        
        if(!fichaSnap.exists()) return null;
        
        const ficha = fichaSnap.data();
        let custoTotalReceita = 0;

        if (ficha.ingredientes && Array.isArray(ficha.ingredientes)) {
            for (let ingrediente of ficha.ingredientes) {
                const insumoSnap = await getDoc(doc(db, "estoque", ingrediente.insumo_id));
                if (insumoSnap.exists()) {
                    const insumo = insumoSnap.data();
                    const custoInsumoPorUnidade = parseFloat(insumo.custo_medio_por_unidade) || 0;
                    custoTotalReceita += (parseFloat(ingrediente.qtd_usada) * custoInsumoPorUnidade);
                }
            }
        }

        const rendimento = parseFloat(ficha.rendimento) || 1;
        const custoPorUnidade = custoTotalReceita / rendimento;
        const lucroBruto = precoVendaProduto - custoPorUnidade;
        const margemLucro = (lucroBruto / precoVendaProduto) * 100;

        return {
            custoPorUnidade: custoPorUnidade,
            lucroReais: lucroBruto,
            margem: margemLucro.toFixed(2) + '%'
        };
    } catch (error) {
        console.error("Erro ao calcular a Ficha Técnica: ", error);
        return null;
    }
}

document.addEventListener("DOMContentLoaded", () => { let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { window.configurarAcordeaoColunas(); if (window.innerWidth > 768) document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('expanded')); }, 250); }); });

// ==========================================
// APLICAR DESCONTO NA EDIÇÃO
// ==========================================
window.aplicarDescontoEdit = function() {
    const descInput = document.getElementById('edit-desconto-pedido');
    const desc = parseFloat(descInput.value.replace(',', '.')) || 0;
    
    if (desc <= 0) return window.showToast('Insira um valor maior que zero.', true);
    
    // Pega o valor total atual e deduz o desconto
    const totalElement = document.getElementById('edit-total-pedido');
    let totalAtual = parseFloat(totalElement.value.replace(/\./g, '').replace(',', '.')) || 0;
    
    totalAtual -= desc;
    if(totalAtual < 0) totalAtual = 0;
    totalElement.value = totalAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    // Adiciona o histórico do desconto no campo de Cupom para controle
    const cupomElement = document.getElementById('edit-cupom-pedido');
    const descText = `Desconto Extra (R$ ${desc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
    cupomElement.value = cupomElement.value ? cupomElement.value + ` | ${descText}` : descText;
    
    // Limpa o campo de desconto e avisa
    descInput.value = '';
    window.showToast('Desconto abatido do Total Final!');
};

// ==========================================
// MÓDULO DE AGENDA DE HORÁRIOS (DATAS RESTRITAS)
// ==========================================

// --- INÍCIO DA REGRA GERAL ---
window.carregarConfigAgendaGeral = async function() {
    try {
        const docSnap = await getDoc(doc(db, 'config', 'agenda_geral'));
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Varre de 0 (Dom) a 6 (Sáb) para preencher a tela
            for (let i = 0; i <= 6; i++) {
                if (data[i]) {
                    document.getElementById(`dia-${i}-ativo`).checked = data[i].ativo || false;
                    document.getElementById(`dia-${i}-horas`).value = data[i].horarios || '';
                }
            }
        }
    } catch (error) {
        console.error("Erro ao carregar a regra geral:", error);
    }
};

window.salvarConfigAgendaGeral = async function() {
    window.mostrarLoading(true);
    try {
        let agendaDaSemana = {};
        
        // Varre de 0 a 6 para ler os valores da tela e montar o objeto
        for (let i = 0; i <= 6; i++) {
            agendaDaSemana[i] = {
                ativo: document.getElementById(`dia-${i}-ativo`).checked,
                horarios: document.getElementById(`dia-${i}-horas`).value.trim()
            };
        }

        // Salva o pacotão com os 7 dias de uma vez no Firebase
        await setDoc(doc(db, 'config', 'agenda_geral'), agendaDaSemana);
        
        window.showToast('Regra Geral salva com sucesso!');
    } catch (error) {
        window.showToast('Erro ao salvar configurações.', true);
    }
    window.mostrarLoading(false);
};
// --- FIM DA REGRA GERAL ---

window.allAgendas = [];

window.loadAgendas = async function() {
    const s = await getDocs(collection(db, "agenda_horarios"));
    window.allAgendas = [];
    s.forEach(d => window.allAgendas.push({ id: d.id, ...d.data() }));
    window.renderAgendasTable();
}

// Função para Salvar Edição Rápida
window.atualizarAgendaInline = async function(id, campo, valor) {
    try {
        await updateDoc(doc(db, "agenda_horarios", id), { [campo]: valor });
        window.showToast("Edição salva com sucesso!");
    } catch (e) {
        window.showToast("Erro ao editar.", true);
    }
};

// Motor de visualização de 30 em 30 min para o Admin
window.previewHorariosAdmin = function(texto) {
    if (!texto || texto.trim() === '') return [];
    const blocos = texto.split(',').map(b => b.trim());
    let resultado = [];
    function formata(min) { return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`; }
    blocos.forEach(bloco => {
        const partes = bloco.split(/\s+(?:às|as|-)\s+/i);
        if (partes.length === 2) {
            let [i, f] = partes.map(p => { let m = p.replace(/[^0-9:]/g,'').split(':'); return (parseInt(m[0]||0)*60)+parseInt(m[1]||0); });
            for (let m = i; m <= f; m += 30) resultado.push(formata(m));
        } else {
            let m = bloco.replace(/[^0-9:]/g,'').split(':');
            if(m[0]) resultado.push(formata((parseInt(m[0])*60)+parseInt(m[1]||0)));
        }
    });
    return [...new Set(resultado)].sort();
};

window.renderAgendasTable = function() {
    const tb = document.querySelector('#tbl-horarios tbody');
    if(!tb) return;
    tb.innerHTML = '';
    
    const ordenadas = window.allAgendas.sort((a, b) => a.id.localeCompare(b.id));

    ordenadas.forEach(a => {
        const dataFormatada = a.id.split('-').reverse().join('/'); 
        let htmlEdicao = '';

        if (a.indisponivel) {
            const msgAtual = a.mensagem || '⛔ FECHADO (Bloqueado)';
            htmlEdicao = `<input type="text" value="${msgAtual}" onchange="window.atualizarAgendaInline('${a.id}', 'mensagem', this.value)" style="border: 1px dashed transparent; background: transparent; padding: 4px; border-radius: 4px; color: #E60000; font-weight: bold; width: 100%; transition: 0.2s;" placeholder="Digite o aviso para o cliente...">`;
        } else {
            // Se as horas estiverem em Array (código antigo) ou String (código novo), ele trata corretamente
            const hrsAtual = Array.isArray(a.horarios) ? a.horarios.join(', ') : (a.horarios || '');
            const previewGerado = window.previewHorariosAdmin(hrsAtual).join(', ');
            
            htmlEdicao = `
                <input type="text" value="${hrsAtual}" onchange="window.atualizarAgendaInline('${a.id}', 'horarios', this.value)" style="border: 1px dashed transparent; background: transparent; padding: 4px; border-radius: 4px; color: #333; font-weight: bold; width: 100%; transition: 0.2s;" placeholder="Ex: 8h às 12h, 15h às 20h">
                <div style="font-size: 0.75rem; color: #777; margin-top: 4px;">Horários
                : ${previewGerado || 'Nenhum'}</div>
            `;
        }

        tb.innerHTML += `<tr>
            <td data-label="Data Restrita:"><strong style="color:var(--favu-rust); font-size:1.1rem;">${dataFormatada}</strong></td>
            <td data-label="Horários/Mensagem:">${htmlEdicao}</td>
            <td data-label="Ações:">
                <div class="action-btns-wrapper">
                    <button class="btn-action del" onclick="window.delAgenda('${a.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    });
}

import { deleteField } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; // Certifique-se de incluir o deleteField no topo do arquivo se não houver

// Salva ou atualiza uma data específica
// Alterna visualmente os campos dependendo se está fechado ou não
window.toggleExcecaoCampos = function() {
    const fechado = document.getElementById('exc-fechado').checked;
    document.getElementById('container-exc-horas').style.display = fechado ? 'none' : 'block';
    document.getElementById('container-exc-mensagem').style.display = fechado ? 'block' : 'none';
};

// Salva ou atualiza uma data específica
// Salva ou atualiza uma data específica do ZERO
window.salvarExcecaoData = async function() {
    const dataAlvo = document.getElementById('exc-data').value;
    const estaFechado = document.getElementById('exc-fechado').checked;
    const horariosTexto = document.getElementById('exc-horas').value.trim();
    const mensagemTexto = document.getElementById('exc-mensagem').value.trim();

    if (!dataAlvo) { window.showToast('Selecione uma data.', true); return; }

    window.mostrarLoading(true);
    try {
        const payload = {
            indisponivel: estaFechado,
            horarios: estaFechado ? "" : horariosTexto,
            mensagem: estaFechado ? mensagemTexto : ""
        };

        await setDoc(doc(db, 'config', 'agenda_excecoes'), { [dataAlvo]: payload }, { merge: true });
        window.showToast('Regra aplicada!');
        
        // Limpa tudo
        document.getElementById('exc-data').value = '';
        document.getElementById('exc-fechado').checked = false;
        document.getElementById('exc-horas').value = '';
        document.getElementById('exc-mensagem').value = '';
        document.getElementById('container-exc-horas').style.display = 'block';
        document.getElementById('container-exc-msg').style.display = 'none';
        
        window.carregarExcecoesLista();
    } catch (error) { window.showToast('Erro ao gravar.', true); }
    window.mostrarLoading(false);
};

// Nova Função Mágica: Salva a edição na hora que você digita na lista!
window.atualizarExcecaoInline = async function(dataString, campo, valor) {
    try {
        await setDoc(doc(db, 'config', 'agenda_excecoes'), {
            [dataString]: { [campo]: valor }
        }, { merge: true });
        window.showToast("Edição salva com sucesso!");
    } catch(e) { window.showToast("Erro ao editar.", true); }
};

// Carrega a lista transformando a exibição em campos de edição direta (Inline Editing)
window.carregarExcecoesLista = async function() {
    const container = document.getElementById('lista-excecoes-container');
    if (!container) return;
    
    try {
        const docSnap = await getDoc(doc(db, 'config', 'agenda_excecoes'));
        container.innerHTML = '';
        
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const datasOrdenadas = Object.keys(dados).sort();
            
            if (datasOrdenadas.length === 0) {
                container.innerHTML = '<p style="color:#888; font-size:0.9rem;">Nenhuma data especial.</p>';
                return;
            }

            datasOrdenadas.forEach(dataString => {
                const regra = dados[dataString];
                const [ano, mes, dia] = dataString.split('-');
                const dataFormatada = `${dia}/${mes}/${ano}`;

                let htmlEdicao;
                if (regra.indisponivel) {
                    const msgAtual = regra.mensagem || '⛔ FECHADO (Bloqueado)';
                    htmlEdicao = `<div style="display:flex; flex-direction:column; flex:1;">
                                    <span style="color:var(--danger); font-size: 0.8rem; font-weight:bold; margin-bottom:2px;">Mensagem para o cliente:</span>
                                    <input type="text" value="${msgAtual}" onchange="window.atualizarExcecaoInline('${dataString}', 'mensagem', this.value)" style="border: 1px dashed transparent; background: transparent; padding: 4px; border-radius: 4px; color: var(--danger); font-weight: bold; width: 100%; transition: 0.2s;" onfocus="this.style.border='1px dashed #ccc'; this.style.background='#f9f9f9'" onblur="this.style.border='1px dashed transparent'; this.style.background='transparent'">
                                  </div>`;
                } else {
                    const hrsAtual = regra.horarios || '';
                    htmlEdicao = `<div style="display:flex; flex-direction:column; flex:1;">
                                    <span style="color:var(--favu-moss); font-size: 0.8rem; font-weight:bold; margin-bottom:2px;">Horários/Intervalos:</span>
                                    <input type="text" value="${hrsAtual}" onchange="window.atualizarExcecaoInline('${dataString}', 'horarios', this.value)" style="border: 1px dashed transparent; background: transparent; padding: 4px; border-radius: 4px; color: #333; font-weight: bold; width: 100%; transition: 0.2s;" onfocus="this.style.border='1px dashed #ccc'; this.style.background='#f9f9f9'" onblur="this.style.border='1px dashed transparent'; this.style.background='transparent'">
                                  </div>`;
                }

                container.innerHTML += `
                    <div style="display:flex; align-items:center; background:#fff; padding:12px; border-radius:8px; border:1px solid #ddd; gap: 15px; margin-bottom: 8px;">
                        <div style="background: rgba(0,0,0,0.05); padding: 8px 12px; border-radius: 6px;">
                            <strong>${dataFormatada}</strong>
                        </div>
                        ${htmlEdicao}
                        <button type="button" onclick="window.deletarExcecaoData('${dataString}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem; padding: 10px;"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
            });
        } else {
            container.innerHTML = '<p style="color:#888; font-size:0.9rem;">Nenhuma data especial.</p>';
        }
    } catch (error) { console.error(error); }
};

window.deletarExcecaoData = async function(dataString) {
    if (!confirm(`Deseja remover a regra da data ${dataString}?`)) return;
    window.mostrarLoading(true);
    try {
        await updateDoc(doc(db, 'config', 'agenda_excecoes'), { [dataString]: deleteField() });
        window.carregarExcecoesLista();
    } catch (error) { window.showToast('Erro ao remover.', true); }
    window.mostrarLoading(false);
};

// Carrega as exceções salvas e monta o visual (AGORA COM BOTÃO DE EDITAR)
window.carregarExcecoesLista = async function() {
    const container = document.getElementById('lista-excecoes-container');
    if (!container) return;
    
    try {
        const docSnap = await getDoc(doc(db, 'config', 'agenda_excecoes'));
        container.innerHTML = '';
        
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const datasOrdenadas = Object.keys(dados).sort();
            
            if (datasOrdenadas.length === 0) {
                container.innerHTML = '<p style="color:#888; font-size:0.9rem;">Nenhuma data especial configurada.</p>';
                return;
            }

            datasOrdenadas.forEach(dataString => {
                const regra = dados[dataString];
                const [ano, mes, dia] = dataString.split('-');
                const dataFormatadaVisivel = `${dia}/${mes}/${ano}`;

                // Se tiver mensagem, exibe. Se não tiver, exibe padrão.
                let textoRegra = regra.indisponivel 
                    ? `<span style="color:var(--danger); font-weight:bold;">⛔ FECHADO${regra.mensagem ? ` (${regra.mensagem})` : ''}</span>`
                    : `⏰ Horários: ${regra.horarios}`;

                container.innerHTML += `
                    <div style="display:flex; justify-content:between; align-items:center; background:#fff; padding:10px; border-radius:6px; border:1px solid #ddd; justify-content: space-between;">
                        <div>
                            <strong>${dataFormatadaVisivel}</strong> — ${textoRegra}
                        </div>
                        <div style="display:flex; gap:12px;">
                            <button type="button" title="Editar" onclick="window.editarExcecaoData('${dataString}')" style="background:none; border:none; color:var(--favu-rust); cursor:pointer; font-size:1.1rem;"><i class="fas fa-edit"></i></button>
                            <button type="button" title="Excluir" onclick="window.deletarExcecaoData('${dataString}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.1rem;"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                `;
            });
        } else {
            container.innerHTML = '<p style="color:#888; font-size:0.9rem;">Nenhuma data especial configurada.</p>';
        }
    } catch (error) {
        console.error("Erro ao listar exceções:", error);
    }
};

// NOVA FUNÇÃO: Puxa a regra de volta para os campos para você editar
window.editarExcecaoData = async function(dataString) {
    try {
        const docSnap = await getDoc(doc(db, 'config', 'agenda_excecoes'));
        if (docSnap.exists()) {
            const regra = docSnap.data()[dataString];
            if (regra) {
                document.getElementById('exc-data').value = dataString;
                document.getElementById('exc-fechado').checked = regra.indisponivel || false;
                document.getElementById('exc-horas').value = regra.horarios || '';
                
                // Preenche a mensagem caso exista (verificando compatibilidade com o HTML)
                const msgInput = document.getElementById('exc-mensagem');
                if(msgInput) msgInput.value = regra.mensagem || '';
                
                window.toggleExcecaoCampos();
                
                // Rola a tela suavemente para cima até o formulário
                document.getElementById('exc-data').scrollIntoView({behavior: "smooth", block: "center"});
                window.showToast("Edite os dados e clique em Adicionar Regra");
            }
        }
    } catch (error) {
        window.showToast('Erro ao carregar dados para edição.', true);
    }
};


window.copiarExcecaoData = async function(dataString) {
    let regra = window.cacheExcecoesAgenda?.[dataString];

    if (!regra) {
        try {
            const docSnap = await getDoc(doc(db, 'config', 'agenda_excecoes'));
            window.cacheExcecoesAgenda = docSnap.exists() ? (docSnap.data() || {}) : {};
            regra = window.cacheExcecoesAgenda[dataString];
        } catch (error) {
            window.showToast('Erro ao copiar data específica.', true);
            return;
        }
    }

    if (!regra) return;

    const dataHidden = document.getElementById('edit-exc-data');
    const dataDisplay = document.getElementById('edit-exc-data-display');
    const fechado = document.getElementById('edit-exc-fechado');
    const horas = document.getElementById('edit-exc-horas');
    const msg = document.getElementById('edit-exc-mensagem');

    if (dataHidden) dataHidden.value = '';
    if (dataDisplay) dataDisplay.value = '';
    if (fechado) fechado.checked = !!regra.indisponivel;
    if (horas) horas.value = regra.horarios || '';
    if (msg) msg.value = regra.mensagem || '';

    window.toggleEditExcecaoCampos();
    window.openModal('modal-editar-excecao');
    window.showToast('Escolha uma nova data para salvar a cópia.');
};


// Apaga uma exceção criada
window.deletarExcecaoData = async function(dataString) {
    if (!confirm(`Deseja remover a regra especial da data ${dataString}?`)) return;
    
    window.mostrarLoading(true);
    try {
        const docRef = doc(db, 'config', 'agenda_excecoes');
        await updateDoc(docRef, {
            [dataString]: deleteField()
        });
        window.showToast('Regra removida com sucesso!');
        window.carregarExcecoesLista();
    } catch (error) {
        window.showToast('Erro ao remover regra.', true);
    }
    window.mostrarLoading(false);
};

// Carrega as exceções com a exibição da mensagem de aviso correta para o admin
window.carregarExcecoesLista = async function() {
    const container = document.getElementById('lista-excecoes-container');
    if (!container) return;
    
    try {
        const docSnap = await getDoc(doc(db, 'config', 'agenda_excecoes'));
        container.innerHTML = '';
        
        if (docSnap.exists()) {
            const dados = docSnap.data();
            const datasOrdenadas = Object.keys(dados).sort();
            
            if (datasOrdenadas.length === 0) {
                container.innerHTML = '<p style="color:#888; font-size:0.9rem;">Nenhuma data especial configurada.</p>';
                return;
            }

            datasOrdenadas.forEach(dataString => {
                const regra = dados[dataString];
                const [ano, mes, dia] = dataString.split('-');
                const dataFormatadaVisivel = `${dia}/${mes}/${ano}`;

                let htmlEdicao = '';
                if (regra.indisponivel) {
                    const msgAtual = regra.mensagem || '⛔ FECHADO (Bloqueado)';
                    htmlEdicao = `
                        <div style="display:flex; flex-direction:column; flex:1;">
                            <span style="color:var(--danger); font-size: 0.8rem; font-weight:bold; margin-bottom:2px;">Mensagem exibida no site:</span>
                            <input type="text" value="${msgAtual}" onchange="window.atualizarExcecaoInline('${dataString}', 'mensagem', this.value)" style="border: 1px dashed transparent; background: transparent; padding: 4px; border-radius: 4px; color: var(--danger); font-weight: bold; width: 100%; transition: 0.2s;" placeholder="Digite o aviso...">
                        </div>`;
                } else {
                    const hrsAtual = regra.horarios || '';
                    const previewGerado = window.previewHorariosAdmin ? window.previewHorariosAdmin(hrsAtual).join(', ') : '';
                    htmlEdicao = `
                        <div style="display:flex; flex-direction:column; flex:1;">
                            <span style="color:var(--favu-moss); font-size: 0.8rem; font-weight:bold; margin-bottom:2px;">Turnos/Horários:</span>
                            <input type="text" value="${hrsAtual}" onchange="window.atualizarExcecaoInline('${dataString}', 'horarios', this.value)" style="border: 1px dashed transparent; background: transparent; padding: 4px; border-radius: 4px; color: #333; font-weight: bold; width: 100%; transition: 0.2s;" placeholder="Ex: 8h às 12h, 15h às 20h">
                            <small style="color:#777; font-size:0.75rem; margin-top:3px;"><strong>Horários:</strong> ${previewGerado || 'Nenhum'}</small>
                        </div>`;
                }

                container.innerHTML += `
                    <div style="display:flex; align-items:center; background:#fff; padding:12px; border-radius:8px; border:1px solid #ddd; gap: 15px; margin-bottom: 8px;">
                        <div style="background: rgba(0,0,0,0.05); padding: 8px 12px; border-radius: 6px; white-space:nowrap;">
                            <strong>${dataFormatadaVisivel}</strong>
                        </div>
                        ${htmlEdicao}
                        <button type="button" onclick="window.deletarExcecaoData('${dataString}')" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.2rem; padding: 10px;"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
            });
        } else {
            container.innerHTML = '<p style="color:#888; font-size:0.9rem;">Nenhuma data especial configurada.</p>';
        }
    } catch (error) {
        console.error("Erro ao listar exceções:", error);
    }
};

// Apaga uma exceção criada
window.deletarExcecaoData = async function(dataString) {
    if (!confirm(`Deseja remover a regra especial da data ${dataString}?`)) return;
    
    window.mostrarLoading(true);
    try {
        const docRef = doc(db, 'config', 'agenda_excecoes');
        await updateDoc(docRef, {
            [dataString]: deleteField()
        });
        window.showToast('Regra removida com sucesso!');
        window.carregarExcecoesLista();
    } catch (error) {
        window.showToast('Erro ao remover regra.', true);
    }
    window.mostrarLoading(false);
};


// === HORÁRIOS 2026-06-19: datas específicas com filtro, popup e layout mobile ===
window.filtroExcecoesAtual = window.filtroExcecoesAtual || 'futuras';
window.cacheExcecoesAgenda = window.cacheExcecoesAgenda || {};

function escapeHtmlAgenda(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function dataHojeAgendaKey() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const y = hoje.getFullYear();
    const m = String(hoje.getMonth() + 1).padStart(2, '0');
    const d = String(hoje.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatarDataAgendaBR(dataString) {
    const [ano, mes, dia] = String(dataString || '').split('-');
    if (!ano || !mes || !dia) return dataString || '';
    return `${dia}/${mes}/${ano}`;
}

function resumoRegraAgenda(regra) {
    if (!regra) return '';
    if (regra.indisponivel) {
        return `Fechado${regra.mensagem ? ` — ${regra.mensagem}` : ''}`;
    }

    const horarios = regra.horarios || '';
    const preview = window.previewHorariosAdmin ? window.previewHorariosAdmin(horarios).join(', ') : '';
    return preview ? `Horários: ${preview}` : `Horários: ${horarios || 'Nenhum'}`;
}

window.toggleExcecaoCampos = function() {
    const fechado = document.getElementById('exc-fechado')?.checked;
    const horas = document.getElementById('container-exc-horas');
    const msg = document.getElementById('container-exc-msg') || document.getElementById('container-exc-mensagem');

    if (horas) horas.style.display = fechado ? 'none' : 'block';
    if (msg) msg.style.display = fechado ? 'block' : 'none';
};

window.toggleEditExcecaoCampos = function() {
    const fechado = document.getElementById('edit-exc-fechado')?.checked;
    const horas = document.getElementById('edit-container-exc-horas');
    const msg = document.getElementById('edit-container-exc-msg') || document.getElementById('edit-container-exc-mensagem');

    if (horas) horas.style.display = fechado ? 'none' : 'block';
    if (msg) msg.style.display = fechado ? 'block' : 'none';
};

window.setFiltroExcecoes = function(tipo) {
    window.filtroExcecoesAtual = tipo === 'passadas' ? 'passadas' : 'futuras';

    const btnFuturas = document.getElementById('tab-excecoes-futuras');
    const btnPassadas = document.getElementById('tab-excecoes-passadas');

    if (btnFuturas) btnFuturas.classList.toggle('active', window.filtroExcecoesAtual === 'futuras');
    if (btnPassadas) btnPassadas.classList.toggle('active', window.filtroExcecoesAtual === 'passadas');

    window.renderizarExcecoesAgendaLista();
};

window.renderizarExcecoesAgendaLista = function() {
    const container = document.getElementById('lista-excecoes-container');
    if (!container) return;

    const dados = window.cacheExcecoesAgenda || {};
    const hoje = dataHojeAgendaKey();

    let datas = Object.keys(dados).filter(dataString => {
        return window.filtroExcecoesAtual === 'passadas'
            ? dataString < hoje
            : dataString >= hoje;
    });

    datas.sort((a, b) => {
        return window.filtroExcecoesAtual === 'passadas'
            ? b.localeCompare(a)
            : a.localeCompare(b);
    });

    container.innerHTML = '';

    if (!datas.length) {
        container.innerHTML = `<p style="color:#888; font-size:0.9rem; font-family:var(--font-numbers);">${window.filtroExcecoesAtual === 'passadas' ? 'Nenhuma data passada.' : 'Nenhuma data específica vigente ou futura.'}</p>`;
        return;
    }

    datas.forEach(dataString => {
        const regra = dados[dataString] || {};
        const dataFormatada = formatarDataAgendaBR(dataString);
        const resumo = resumoRegraAgenda(regra);

        container.innerHTML += `
            <div class="excecao-card" onclick="window.editarExcecaoData('${dataString}')">
                <div class="excecao-card-main">
                    <strong class="excecao-card-data">${dataFormatada}</strong>
                    <div class="excecao-card-resumo">${escapeHtmlAgenda(resumo)}</div>
                </div>
                <div class="excecao-card-actions" onclick="event.stopPropagation();">
                    <button type="button" class="btn-action edit" title="Editar" aria-label="Editar" onclick="window.editarExcecaoData('${dataString}')"><i class="fas fa-pencil-alt"></i></button>
                    <button type="button" class="btn-action copy" title="Copiar" aria-label="Copiar" onclick="window.copiarExcecaoData('${dataString}')"><i class="fas fa-copy"></i></button>
                    <button type="button" class="btn-action del" title="Excluir" aria-label="Excluir" onclick="window.deletarExcecaoData('${dataString}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
};

window.carregarExcecoesLista = async function() {
    const container = document.getElementById('lista-excecoes-container');
    if (!container) return;

    try {
        const docSnap = await getDoc(doc(db, 'config', 'agenda_excecoes'));
        window.cacheExcecoesAgenda = docSnap.exists() ? (docSnap.data() || {}) : {};
        window.renderizarExcecoesAgendaLista();
    } catch (error) {
        console.error("Erro ao listar exceções:", error);
        container.innerHTML = '<p style="color:#E60000; font-size:0.9rem; font-family:var(--font-numbers);">Erro ao carregar datas específicas.</p>';
    }
};

window.editarExcecaoData = async function(dataString) {
    let regra = window.cacheExcecoesAgenda?.[dataString];

    if (!regra) {
        try {
            const docSnap = await getDoc(doc(db, 'config', 'agenda_excecoes'));
            window.cacheExcecoesAgenda = docSnap.exists() ? (docSnap.data() || {}) : {};
            regra = window.cacheExcecoesAgenda[dataString];
        } catch (error) {
            window.showToast('Erro ao carregar data específica.', true);
            return;
        }
    }

    if (!regra) return;

    const dataHidden = document.getElementById('edit-exc-data');
    const dataDisplay = document.getElementById('edit-exc-data-display');
    const fechado = document.getElementById('edit-exc-fechado');
    const horas = document.getElementById('edit-exc-horas');
    const msg = document.getElementById('edit-exc-mensagem');

    if (dataHidden) dataHidden.value = dataString;
    if (dataDisplay) dataDisplay.value = dataString;
    if (fechado) fechado.checked = !!regra.indisponivel;
    if (horas) horas.value = regra.horarios || '';
    if (msg) msg.value = regra.mensagem || '';

    window.toggleEditExcecaoCampos();
    window.openModal('modal-editar-excecao');
};


window.abrirModalNovaDataEspecifica = function() {
    const form = document.getElementById('form-add-excecao');
    if (form) form.reset();

    const horas = document.getElementById('container-exc-horas');
    const msg = document.getElementById('container-exc-msg');
    if (horas) horas.style.display = 'block';
    if (msg) msg.style.display = 'none';

    window.openModal('modal-add-excecao');
};

window.salvarExcecaoData = async function() {
    const dataAlvo = document.getElementById('exc-data')?.value;
    const estaFechado = document.getElementById('exc-fechado')?.checked;
    const horariosTexto = document.getElementById('exc-horas')?.value.trim() || '';
    const mensagemTexto = document.getElementById('exc-mensagem')?.value.trim() || '';

    if (!dataAlvo) {
        window.showToast('Selecione uma data.', true);
        return;
    }

    window.mostrarLoading(true);
    try {
        const payload = {
            indisponivel: !!estaFechado,
            horarios: estaFechado ? "" : horariosTexto,
            mensagem: estaFechado ? mensagemTexto : ""
        };

        await setDoc(doc(db, 'config', 'agenda_excecoes'), { [dataAlvo]: payload }, { merge: true });
        window.showToast('Regra aplicada!');

        document.getElementById('exc-data').value = '';
        document.getElementById('exc-fechado').checked = false;
        document.getElementById('exc-horas').value = '';
        document.getElementById('exc-mensagem').value = '';
        window.toggleExcecaoCampos();

        await window.carregarExcecoesLista();
        window.closeModal('modal-add-excecao', 'form-add-excecao');
    } catch (error) {
        window.showToast('Erro ao gravar.', true);
    }
    window.mostrarLoading(false);
};

window.deletarExcecaoData = async function(dataString) {
    window.customConfirm(`Remover a data específica ${formatarDataAgendaBR(dataString)}?`, async () => {
        window.mostrarLoading(true);
        try {
            const docRef = doc(db, 'config', 'agenda_excecoes');
            await updateDoc(docRef, { [dataString]: deleteField() });
            window.showToast('Data específica removida!');
            await window.carregarExcecoesLista();
        } catch (error) {
            window.showToast('Erro ao remover data específica.', true);
        }
        window.mostrarLoading(false);
    });
};

const formEditExcecaoAgenda = document.getElementById('form-edit-excecao');
if (formEditExcecaoAgenda) {
    formEditExcecaoAgenda.onsubmit = async function(e) {
        e.preventDefault();

        const dataOriginal = document.getElementById('edit-exc-data')?.value || '';
        const dataAlvo = document.getElementById('edit-exc-data-display')?.value || '';
        const estaFechado = document.getElementById('edit-exc-fechado')?.checked;
        const horariosTexto = document.getElementById('edit-exc-horas')?.value.trim() || '';
        const mensagemTexto = document.getElementById('edit-exc-mensagem')?.value.trim() || '';

        if (!dataAlvo) {
            window.showToast('Informe a data específica.', true);
            return;
        }

        window.mostrarLoading(true);
        try {
            const payload = {
                indisponivel: !!estaFechado,
                horarios: estaFechado ? "" : horariosTexto,
                mensagem: estaFechado ? mensagemTexto : ""
            };

            const docRef = doc(db, 'config', 'agenda_excecoes');

            if (dataOriginal && dataOriginal !== dataAlvo) {
                await updateDoc(docRef, { [dataOriginal]: deleteField() });
            }

            await setDoc(docRef, { [dataAlvo]: payload }, { merge: true });
            window.closeModal('modal-editar-excecao', 'form-edit-excecao');
            window.showToast(dataOriginal && dataOriginal !== dataAlvo ? 'Data específica alterada!' : 'Data específica atualizada!');
            await window.carregarExcecoesLista();
        } catch (error) {
            console.error(error);
            window.showToast('Erro ao salvar data específica.', true);
        }
        window.mostrarLoading(false);
    };
}

document.getElementById('form-add-agenda').onsubmit = async(e) => {
    e.preventDefault();
    const dataRef = document.getElementById('ag-data').value; 
    const indisponivel = document.getElementById('ag-indisponivel').checked;
    // Agora salva o texto puro (ex: "8h às 12h, 15h às 20h") para o site do cliente processar!
    const horasTexto = indisponivel ? "" : document.getElementById('ag-horas').value.trim();

    await setDoc(doc(db, "agenda_horarios", dataRef), { indisponivel: indisponivel, horarios: horasTexto });
    customAlert("Regra de horários salva!");
    window.closeModal('modal-add-agenda', 'form-add-agenda');
    window.loadAgendas();
};

window.openEditAgenda = async(id) => {
    const a = window.allAgendas.find(x => x.id === id);
    if(!a) return;
    document.getElementById('e-ag-data').value = id;
    document.getElementById('e-ag-data-display').value = id;
    
    const indisponivel = a.indisponivel || false;
    document.getElementById('e-ag-indisponivel').checked = indisponivel;
    document.getElementById('e-ag-horas-container').style.display = indisponivel ? 'none' : 'block';
    document.getElementById('e-ag-horas').value = a.horarios ? a.horarios.join(', ') : '';
    
    window.openModal('modal-editar-agenda');
}

document.getElementById('form-edit-agenda').onsubmit = async(e) => {
    e.preventDefault();
    const dataRef = document.getElementById('e-ag-data').value;
    const indisponivel = document.getElementById('e-ag-indisponivel').checked;
    const horasTexto = indisponivel ? "" : document.getElementById('e-ag-horas').value.trim();

    await updateDoc(doc(db, "agenda_horarios", dataRef), { indisponivel: indisponivel, horarios: horasTexto });
    customAlert("Regra atualizada!");
    window.closeModal('modal-editar-agenda', 'form-edit-agenda');
    window.loadAgendas();
};

window.delAgenda = async(id) => {
    customConfirm(`Excluir as restrições da data ${id.split('-').reverse().join('/')}?`, async () => {
        await deleteDoc(doc(db, "agenda_horarios", id));
        window.loadAgendas();
    });
};

window.setFiltroSemanaAtualVisivel = function() {
    let hoje = new Date(); hoje.setHours(0,0,0,0);
    let diaSemana = hoje.getDay();
    let diff = hoje.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
    
    window.dataInicialIntervalo = new Date(hoje);
    window.dataInicialIntervalo.setDate(diff);
    
    window.dataFinalIntervalo = new Date(window.dataInicialIntervalo);
    window.dataFinalIntervalo.setDate(window.dataInicialIntervalo.getDate() + 6);
    
    window.atualizarDisplayData(); // Mostra visualmente no campo
}


// ==========================================
// MÓDULO DE CUPONS
// ==========================================
window.allCupons = [];
window.filtroCuponsAtual = 'ativos';

window.setFiltroCupons = function(tipo) {
    window.filtroCuponsAtual = tipo === 'inativos' ? 'inativos' : 'ativos';
    document.getElementById('tab-cupons-ativos')?.classList.toggle('active', window.filtroCuponsAtual === 'ativos');
    document.getElementById('tab-cupons-inativos')?.classList.toggle('active', window.filtroCuponsAtual === 'inativos');
    window.renderCupons();
};

window.limparFiltroCupons = function() {
    const campo = document.getElementById('search-cupom');
    if (campo) campo.value = '';
    window.renderCupons();
};

function formatarDataCupomBR(dataString) {
    if (!dataString) return 'Sem validade';
    const d = String(dataString).split('T')[0];
    const partes = d.split('-');
    if (partes.length !== 3) return dataString;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function getStatusOperacionalCupom(cupom) {
    const status = String(cupom?.statusCupom || '').trim().toLowerCase();
    if (status === 'inativo' || status === 'pausado' || cupom?.ativo === false) return 'inativo';
    return 'ativo';
}

function isCupomFuncionando(cupom) {
    return getStatusOperacionalCupom(cupom) === 'ativo' && !isCupomVencido(cupom) && !isCupomEsgotado(cupom);
}

function getCupomStatusTexto(cupom) {
    const statusOperacional = getStatusOperacionalCupom(cupom);
    if (statusOperacional === 'inativo') return 'Inativo';
    if (isCupomVencido(cupom)) return 'Expirado';
    if (isCupomEsgotado(cupom)) return 'Esgotado';
    return 'Ativo';
}

function getCupomBadgeClasse(cupom) {
    const status = getCupomStatusTexto(cupom).toLowerCase();
    if (status === 'ativo') return 'ativo';
    if (status === 'pausado') return 'pausado';
    return 'inativo';
}

function formatarTipoValorCupom(cupom) {
    const valor = converterValorParaNumero(cupom?.valor || 0);
    if (cupom?.tipo === 'percentual') return `${formatarNumeroMoedaPedido(valor).replace(',00', '')}%`;
    return `R$ ${formatarNumeroMoedaPedido(valor)}`;
}

window.loadCupons = function() {
    const lista = document.getElementById('cupons-lista');
    if (!lista) return;

    onSnapshot(collection(db, "cupons"), snap => {
        window.allCupons = [];
        snap.forEach(docSnap => {
            window.allCupons.push({
                id: docSnap.id,
                codigo: docSnap.data().codigo || docSnap.id,
                ...docSnap.data()
            });
        });
        window.renderCupons();
    }, err => {
        console.error("Erro ao carregar cupons:", err);
        lista.innerHTML = '<p style="color:#E60000; font-family:var(--font-numbers);">Erro ao carregar cupons.</p>';
    });
};

window.renderCupons = function() {
    const lista = document.getElementById('cupons-lista');
    if (!lista) return;

    const termoBusca = (document.getElementById('search-cupom')?.value || '').trim().toLowerCase();
    const normalizarBusca = (valor) => String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const termoNormalizado = normalizarBusca(termoBusca);

    const filtrados = [...(window.allCupons || [])]
        .filter(cupom => window.filtroCuponsAtual === 'ativos' ? isCupomFuncionando(cupom) : !isCupomFuncionando(cupom))
        .filter(cupom => {
            if (!termoNormalizado) return true;
            return [
                cupom.codigo,
                cupom.id,
                getCupomStatusTexto(cupom),
                cupom.tipo,
                cupom.valor,
                cupom.valorMinimo,
                cupom.dataValidade
            ].some(valor => normalizarBusca(valor).includes(termoNormalizado));
        })
        .sort((a, b) => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR'));

    if (!filtrados.length) {
        lista.innerHTML = `<p style="color:#888; font-family:var(--font-numbers);">${window.filtroCuponsAtual === 'ativos' ? 'Nenhum cupom ativo encontrado.' : 'Nenhum cupom inativo encontrado.'}</p>`;
        return;
    }

    lista.innerHTML = filtrados.map(cupom => {
        const usos = getCupomUsosAtuais(cupom);
        const max = getCupomMaxUsos(cupom);
        const status = getCupomStatusTexto(cupom);
        const badgeClasse = getCupomBadgeClasse(cupom);
        const statusOperacional = getStatusOperacionalCupom(cupom);

        const acaoStatus = statusOperacional === 'ativo'
            ? `<button type="button" class="btn-action inactive" title="Inativar" onclick="window.definirStatusCupom('${cupom.id}', 'inativo')"><i class="fas fa-ban"></i></button>`
            : `<button type="button" class="btn-action activate" title="Ativar" onclick="window.definirStatusCupom('${cupom.id}', 'ativo')"><i class="fas fa-eye"></i></button>`;

        return `
            <div class="cupom-card">
                <div>
                    <div class="cupom-card-title">${escapeHtmlPedido(cupom.codigo || cupom.id)} <span class="cupom-badge ${badgeClasse}">${status}</span></div>
                    <div class="cupom-meta">
                        Uso: <strong>${usos}/${max || '∞'}</strong><br>
                        Validade: <strong>${formatarDataCupomBR(cupom.dataValidade)}</strong><br>
                        Desconto: <strong>${formatarTipoValorCupom(cupom)}</strong> • Pedido mínimo: <strong>R$ ${formatarNumeroMoedaPedido(cupom.valorMinimo || 0)}</strong>
                    </div>
                </div>
                <div class="cupom-card-actions">
                    <button type="button" class="btn-action edit" title="Editar" onclick="window.editarCupom('${cupom.id}')"><i class="fas fa-pen"></i></button>
                    <button type="button" class="btn-action copy" title="Copiar" onclick="window.copiarCupom('${cupom.id}')"><i class="fas fa-copy"></i></button>
                    ${acaoStatus}
                    <button type="button" class="btn-action del" title="Excluir" onclick="window.excluirCupom('${cupom.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');
};

window.limparFormCupom = function() {
    const form = document.getElementById('form-cupom');
    if (form) form.reset();
    const original = document.getElementById('cupom-id-original');
    if (original) original.value = '';
    const codigo = document.getElementById('cupom-codigo');
    if (codigo) codigo.disabled = false;
};

window.editarCupom = function(id) {
    const cupom = window.allCupons.find(c => c.id === id);
    if (!cupom) return;

    document.getElementById('edit-cupom-id-original').value = id;
    document.getElementById('edit-cupom-codigo').value = cupom.codigo || id;
    document.getElementById('edit-cupom-validade').value = String(cupom.dataValidade || '').split('T')[0];
    document.getElementById('edit-cupom-max-uso').value = getCupomMaxUsos(cupom) || '';
    document.getElementById('edit-cupom-tipo').value = cupom.tipo || 'fixo';
    document.getElementById('edit-cupom-valor').value = converterValorParaNumero(cupom.valor || 0);
    document.getElementById('edit-cupom-minimo').value = converterValorParaNumero(cupom.valorMinimo || 0);

    window.openModal('modal-editar-cupom');
};

window.copiarCupom = function(id) {
    const cupom = window.allCupons.find(c => c.id === id);
    if (!cupom) return;

    window.limparFormCupom();
    document.getElementById('cupom-codigo').value = `${cupom.codigo || id}_COPIA`;
    document.getElementById('cupom-validade').value = String(cupom.dataValidade || '').split('T')[0];
    document.getElementById('cupom-max-uso').value = getCupomMaxUsos(cupom) || '';
    document.getElementById('cupom-tipo').value = cupom.tipo || 'fixo';
    document.getElementById('cupom-valor').value = converterValorParaNumero(cupom.valor || 0);
    document.getElementById('cupom-minimo').value = converterValorParaNumero(cupom.valorMinimo || 0);
    document.getElementById('form-cupom')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.definirStatusCupom = async function(id, status) {
    const cupom = window.allCupons.find(c => c.id === id);
    if (!cupom) return;

    const statusFinal = ['ativo', 'inativo'].includes(status) ? status : 'ativo';
    await updateDoc(doc(db, "cupons", id), {
        ativo: statusFinal === 'ativo',
        statusCupom: statusFinal,
        updatedAt: Date.now()
    });

    const mensagens = { ativo: 'Cupom ativado!', inativo: 'Cupom inativado!' };
    window.showToast(mensagens[statusFinal] || 'Cupom atualizado!');
};

window.alternarCupom = async function(id) {
    const cupom = window.allCupons.find(c => c.id === id);
    if (!cupom) return;
    await window.definirStatusCupom(id, getStatusOperacionalCupom(cupom) === 'ativo' ? 'inativo' : 'ativo');
};

window.excluirCupom = function(id) {
    window.customConfirm(`Excluir o cupom ${id}?`, async () => {
        window.mostrarLoading(true);
        try {
            await deleteDoc(doc(db, "cupons", id));
            window.showToast('Cupom excluído!');
            window.limparFormCupom();
        } catch (err) {
            console.error(err);
            window.showToast('Erro ao excluir cupom.', true);
        }
        window.mostrarLoading(false);
    });
};


const formEditCupom = document.getElementById('form-edit-cupom');
if (formEditCupom) {
    formEditCupom.onsubmit = async function(e) {
        e.preventDefault();

        const original = document.getElementById('edit-cupom-id-original').value.trim().toUpperCase();
        const cupomExistente = original ? window.allCupons.find(c => c.id === original) : null;
        const maxUso = parseInt(document.getElementById('edit-cupom-max-uso').value, 10) || 0;
        const tipo = document.getElementById('edit-cupom-tipo').value;
        const valor = converterValorParaNumero(document.getElementById('edit-cupom-valor').value || 0);
        const valorMinimo = converterValorParaNumero(document.getElementById('edit-cupom-minimo').value || 0);
        const statusCupom = cupomExistente ? getStatusOperacionalCupom(cupomExistente) : 'ativo';
        const ativo = statusCupom === 'ativo';
        const usosAtuais = cupomExistente ? getCupomUsosAtuais(cupomExistente) : 0;

        if (!original || maxUso <= 0 || valor <= 0) {
            window.showToast('Preencha validade, máximo de uso e valor do desconto.', true);
            return;
        }

        window.mostrarLoading(true);
        try {
            await setDoc(doc(db, "cupons", original), {
                codigo: original,
                dataValidade: document.getElementById('edit-cupom-validade').value,
                quantidadeDisponivel: maxUso,
                usosAtuais: Math.min(usosAtuais, maxUso),
                tipo,
                valor,
                valorMinimo,
                ativo,
                statusCupom,
                updatedAt: Date.now()
            }, { merge: true });

            window.showToast('Cupom atualizado!');
            window.closeModal('modal-editar-cupom', 'form-edit-cupom');
        } catch (err) {
            console.error(err);
            window.showToast('Erro ao atualizar cupom.', true);
        }
        window.mostrarLoading(false);
    };
}

const formCupom = document.getElementById('form-cupom');
if (formCupom) {
    formCupom.onsubmit = async function(e) {
        e.preventDefault();

        const original = document.getElementById('cupom-id-original').value.trim().toUpperCase();
        const codigo = document.getElementById('cupom-codigo').value.trim().toUpperCase().replace(/\s+/g, '');
        const validade = document.getElementById('cupom-validade').value;
        const maxUso = parseInt(document.getElementById('cupom-max-uso').value, 10) || 0;
        const cupomExistente = original ? window.allCupons.find(c => c.id === original) : null;
        const usosAtuais = cupomExistente ? getCupomUsosAtuais(cupomExistente) : 0;
        const statusCupom = cupomExistente ? getStatusOperacionalCupom(cupomExistente) : 'ativo';
        const tipo = document.getElementById('cupom-tipo').value;
        const valor = converterValorParaNumero(document.getElementById('cupom-valor').value || 0);
        const valorMinimo = converterValorParaNumero(document.getElementById('cupom-minimo').value || 0);
        const ativo = statusCupom === 'ativo';

        if (!codigo || !validade || maxUso <= 0 || valor <= 0) {
            window.showToast('Preencha código, validade, máximo de uso e valor do desconto.', true);
            return;
        }

        window.mostrarLoading(true);
        try {
            const payload = {
                codigo,
                dataValidade: validade,
                quantidadeDisponivel: maxUso,
                usosAtuais: Math.min(usosAtuais, maxUso),
                tipo,
                valor,
                valorMinimo,
                ativo,
                statusCupom,
                updatedAt: Date.now()
            };

            if (!original) payload.createdAt = Date.now();

            if (original && original !== codigo) {
                await deleteDoc(doc(db, "cupons", original));
            }

            await setDoc(doc(db, "cupons", codigo), payload, { merge: true });
            window.showToast('Cupom salvo!');
            window.limparFormCupom();
        } catch (err) {
            console.error(err);
            window.showToast('Erro ao salvar cupom.', true);
        }
        window.mostrarLoading(false);
    };
}


async function init() { 
    window.addVariation(false); 
    await syncCats(); 
    await loadProds(); 
    loadAvisos(); 
    loadTema(); 
    loadCarrossel(); 
    window.inicializarKanban(); 
    window.setFiltroSemanaAtualVisivel();
    listenPedidos(); 
    window.carregarConfigAgendaGeral();
    window.carregarExcecoesLista(); // <-- Carrega a nova lista de exceções
    window.loadCupons?.();
}

// ==========================================
// EXPORTAR PEDIDOS PARA EXCEL/CSV
// ==========================================
window.exportarPedidosCSV = function() {
    // Pega os pedidos que estão filtrados na tela no momento
    const pedidos = window.obterPedidosFiltrados();
    
    if (pedidos.length === 0) {
        return window.showToast("Nenhum pedido para exportar na tela atual.", true);
    }

    // Cabeçalho das colunas do Excel
    let csv = "ID_do_Pedido,Cliente,Telefone,Data_Entrega,Horario_Entrega,Status_do_Pedido,Status_Pagamento,Forma_de_Pagamento,Modalidade_Credito,Total,Taxa_Pagamento,Valor_Taxa_Pagamento,Valor_Recebido\n";
    
    // Varre os pedidos e monta as linhas
    pedidos.forEach(p => {
        const id = p.ID_do_Pedido || "";
        const cliente = (p.Nome_Cliente || "").replace(/,/g, ""); // Tira vírgulas do nome para não quebrar a coluna
        const tel = p.Numero || "";
        const data = p.Data_Entrega || "";
        const hora = p.Horario_Entrega || "";
        const status = p.Status_do_Pedido || "";
        const pgto = p.Status_Pagamento || "";
        const forma = p.Forma_de_Pagamento || "";
        const total = p.Total_Final || "0,00";
        
        csv += `${id},${cliente},${tel},${data},${hora},${status},${pgto},${forma},"${total}"\n`;
    });

    // Cria o arquivo invisível e força o download no navegador
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); // "\uFEFF" resolve acentos no Excel (BOM)
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Favu_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
    link.click();
    
    window.showToast("Download iniciado!");
};

// O onAuthStateChanged gerencia tudo, se ele detectar login ele mostra o painel e roda o init()
onAuthStateChanged(auth, (user) => {
    const loginScreen = document.getElementById("login-screen");
    const adminPanel = document.getElementById("admin-panel");
    
    if (user) {
        // Usuário logado
        loginScreen.style.display = "none";
        adminPanel.style.display = "block";
        init();
    } else {
        // Usuário não logado
        loginScreen.style.display = "block";
        adminPanel.style.display = "none";
        document.getElementById("login-user").value = "";
        document.getElementById("login-pass").value = "";
    }
});

// ==========================================
// FECHAMENTO FINANCEIRO E DIVISÃO (SÓCIOS)
// ==========================================
window.abrirModalFechamento = function() {
    // Pega os pedidos da tela atual (idêntico ao cálculo do Dashboard)
    let pedidos = window.ticketsSelecionados.size > 0 
        ? window.todosPedidos.filter(p => window.ticketsSelecionados.has(p.ID_do_Pedido)) 
        : ( (document.getElementById('search-input-pedidos')?.value.trim() || document.getElementById('date-input')?.value) 
            ? window.obterPedidosFiltrados() : window.obterPedidosFiltrados().filter(p => window.obterPedidosDaSemanaAtual().includes(p)) );
    
    // Ignora pedidos cancelados para não somar faturamento fantasma
    pedidos = pedidos.filter(p => !(p.Status_do_Pedido || '').toLowerCase().includes('cancelado'));

    if(pedidos.length === 0) return window.showToast('Nenhum pedido para fechar!', true);

    window.pedidosFechamento = pedidos;
    
    let totalVendas = 0;
    let totalTaxasPagamento = 0;
    let total = 0;
    let datas = [];
    pedidos.forEach(p => {
        const valorPedido = calcularValorPedido(p);
        const taxaPedido = calcularTaxaPagamentoPedido(p);
        totalVendas += valorPedido;
        totalTaxasPagamento += taxaPedido;
        total += Math.max(0, valorPedido - taxaPedido);
        if(p.Data_Entrega) datas.push(p.Data_Entrega);
    });

    // NOVA LÓGICA: Puxa o período diretamente do filtro do calendário
    let periodoStr = "";
    if (window.dataInicialIntervalo) {
        const pData = window.dataInicialIntervalo;
        const uData = window.dataFinalIntervalo || window.dataInicialIntervalo;
        const pStr = String(pData.getDate()).padStart(2,'0') + '/' + String(pData.getMonth()+1).padStart(2,'0');
        const uStr = String(uData.getDate()).padStart(2,'0') + '/' + String(uData.getMonth()+1).padStart(2,'0');
        periodoStr = pStr === uStr ? pStr : `${pStr} - ${uStr}`;
    } else if (datas.length > 0) { 
        // Fallback: Se não houver filtro de data ativo, pega pelas datas dos pedidos
        const datasParsed = datas.map(d => parseDataBR(d)).filter(d => d).sort((a,b) => a-b);
        if(datasParsed.length > 0) {
            const pData = datasParsed[0];
            const uData = datasParsed[datasParsed.length-1];
            const pStr = String(pData.getDate()).padStart(2,'0') + '/' + String(pData.getMonth()+1).padStart(2,'0');
            const uStr = String(uData.getDate()).padStart(2,'0') + '/' + String(uData.getMonth()+1).padStart(2,'0');
            periodoStr = pStr === uStr ? pStr : `${pStr} - ${uStr}`;
        }
    }

    document.getElementById('fechamento-periodo').textContent = periodoStr ? `(${periodoStr})` : '';
    
    window.totalFechamentoVendasAtual = totalVendas;
    window.totalTaxasPagamentoAtual = totalTaxasPagamento;
    window.totalFechamentoAtual = total;
    window.calcularDivisaoFechamento();

    window.openModal('modal-fechamento-financeiro');
};

window.calcularDivisaoFechamento = function() {
    const totalBase = window.totalFechamentoAtual || 0;
    const totalVendasBruto = window.totalFechamentoVendasAtual ?? totalBase;
    const totalTaxasPagamento = window.totalTaxasPagamentoAtual || 0;
    
    const percCaixa = parseFloat(document.getElementById('perc-caixa').value) || 0;
    const percAra = parseFloat(document.getElementById('perc-ara').value) || 0;
    const percFla = parseFloat(document.getElementById('perc-fla').value) || 0;

    const gCaixa = parseFloat(document.getElementById('gasto-manual-caixa').value) || 0;
    const gAra = parseFloat(document.getElementById('gasto-manual-ara').value) || 0;
    const gFla = parseFloat(document.getElementById('gasto-manual-fla').value) || 0;

    const totalGasto = gCaixa + gAra + gFla;

    const lucroLiquido = totalBase - totalGasto;
    document.getElementById('fechamento-lucro-liquido').textContent = lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const lucroCaixa = lucroLiquido * (percCaixa / 100);
    const lucroAra = lucroLiquido * (percAra / 100);
    const lucroFla = lucroLiquido * (percFla / 100);

    const finalCaixa = lucroCaixa + gCaixa;
    const finalAra = lucroAra + gAra;
    const finalFla = lucroFla + gFla;

    // Define as cores dinamicamente baseado nos valores reais calculados
    const corVendas = totalVendasBruto > 0 ? 'color: #27ae60;' : totalVendasBruto < 0 ? 'color: #c0392b;' : '';
    const corTaxas = totalTaxasPagamento > 0 ? 'color: #c0392b;' : '';
    const corFaturamento = totalBase > 0 ? 'color: #27ae60;' : totalBase < 0 ? 'color: #c0392b;' : '';
    const corGastos = totalGasto > 0 ? 'color: #c0392b;' : '';
    const corLucro = lucroLiquido > 0 ? 'color: #27ae60;' : lucroLiquido < 0 ? 'color: #c0392b;' : '';

    const corCaixa = finalCaixa > 0 ? 'color: #27ae60;' : finalCaixa < 0 ? 'color: #c0392b;' : '';
    const corAra = finalAra > 0 ? 'color: #27ae60;' : finalAra < 0 ? 'color: #c0392b;' : '';
    const corLucroAra = lucroAra > 0 ? 'color: #27ae60;' : lucroAra < 0 ? 'color: #c0392b;' : '';
    
    const corFla = finalFla > 0 ? 'color: #27ae60;' : finalFla < 0 ? 'color: #c0392b;' : '';
    const corLucroFla = lucroFla > 0 ? 'color: #27ae60;' : lucroFla < 0 ? 'color: #c0392b;' : '';

    // NOVO FORMATO DE TEXTO COM SEPARAÇÃO VISUAL E CORES DINÂMICAS
    const detalheHTML = `
        <div style="font-family: var(--font-numbers) !important; font-size: 1.05rem; line-height: 1.6; color: #333;">
            
            Total de Vendas: <strong style="${corVendas}">${totalVendasBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><br>
            Total Taxas: <strong style="${corTaxas}">- ${totalTaxasPagamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><br>
            Total de Gastos: <strong style="${corGastos}">- ${totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><br><br>
            Lucro: <strong style="${corLucro}">${lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            
            <div style="margin: 15px 0; border-top: 1px dashed rgba(0, 0, 0, 0.15);"></div>
            
            <strong>Divisão Detalhada:</strong><br><br>
            
            • Caixa: <strong style="${corCaixa}">${finalCaixa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><br><br>
            
            • Arabela: = <strong style="${corAra}">${finalAra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><br>
            &nbsp;&nbsp;&nbsp;⤷ Reembolso = <span style="${gAra > 0 ? 'color: #27ae60;' : ''}">${gAra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span><br>
            &nbsp;&nbsp;&nbsp;⤷ Lucro = <span style="${corLucroAra}">${lucroAra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span><br><br>
            
            • Flávio: = <strong style="${corFla}">${finalFla.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><br>
            &nbsp;&nbsp;&nbsp;⤷ Reembolso = <span style="${gFla > 0 ? 'color: #27ae60;' : ''}">${gFla.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span><br>
            &nbsp;&nbsp;&nbsp;⤷ Lucro = <span style="${corLucroFla}">${lucroFla.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>
    `;

    document.getElementById('fechamento-divisao-detalhe').innerHTML = detalheHTML;

    // Salvar dados globais para envio no WhatsApp (adicionado os Lucros separados)
    window.dadosFechamentoWA = {
        totalVendido: totalVendasBruto,
        totalTaxas: totalTaxasPagamento,
        totalFaturamento: totalBase,
        totalGasto: totalGasto,
        lucroLiquido: lucroLiquido,
        gCaixa: gCaixa,
        gAra: gAra,
        gFla: gFla,
        lucroAra: lucroAra,
        lucroFla: lucroFla,
        finalCaixa: finalCaixa,
        finalAra: finalAra,
        finalFla: finalFla,
        percCaixa: document.getElementById('perc-caixa').value,
        percAra: document.getElementById('perc-ara').value,
        percFla: document.getElementById('perc-fla').value
    };
};

window.enviarFechamentoWA = function(destinatario) {
    // Puxa o período e remove os parênteses limpinho
    const periodo = document.getElementById('fechamento-periodo').textContent.replace(/[()]/g, '').trim();
    
    const totalVendido = window.totalFechamentoVendasAtual ?? (window.totalFechamentoAtual || 0);
    const totalTaxas = window.totalTaxasPagamentoAtual || 0;
    const totalFaturamento = window.totalFechamentoAtual || 0;
    
    const gCaixa = parseFloat(document.getElementById('gasto-manual-caixa').value || 0);
    const gAra = parseFloat(document.getElementById('gasto-manual-ara').value || 0);
    const gFla = parseFloat(document.getElementById('gasto-manual-fla').value || 0);
    const totalGasto = gCaixa + gAra + gFla;
    const lucroLiquido = totalFaturamento - totalGasto;

    const pCaixa = parseFloat(document.getElementById('perc-caixa').value || 30) / 100;
    const pAra = parseFloat(document.getElementById('perc-ara').value || 35) / 100;
    const pFla = parseFloat(document.getElementById('perc-fla').value || 35) / 100;

    const lucroCaixa = lucroLiquido * pCaixa;
    const lucroAra = lucroLiquido * pAra;
    const lucroFla = lucroLiquido * pFla;

    const finalCaixa = lucroCaixa + gCaixa;
    const finalAra = lucroAra + gAra;
    const finalFla = lucroFla + gFla;

    const dados = {
        periodo, totalVendido, totalTaxas, totalFaturamento, totalGasto, lucroLiquido,
        gCaixa, gAra, gFla,
        finalCaixa, finalAra, finalFla,
        lucroAra, lucroFla
    };

    let txt = `*FAVU - Fechamento Financeiro*\n`;
    txt += `*Período:* ${dados.periodo}\n\n`;
    
    txt += `*Total de Vendas:* ${dados.totalVendido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    txt += `*Total Taxas:* - ${dados.totalTaxas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    txt += `*Faturamento:* ${dados.totalFaturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    txt += `*Total de Gastos:* - ${dados.totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    // Adicionado o espaço extra (\n\n) abaixo do Lucro
    txt += `*Lucro:* ${dados.lucroLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n\n`;
    txt += `*-------------------------------------*\n\n`;

    txt += `*Divisão Detalhada:*\n\n`;
    txt += `• Caixa: *${dados.finalCaixa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*\n\n`;
    
    txt += `• Arabela: = *${dados.finalAra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*\n`;
    txt += `   ⤷ Reembolso = ${dados.gAra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    txt += `   ⤷ Lucro = ${dados.lucroAra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n\n`;
    
    txt += `• Flávio: = *${dados.finalFla.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}*\n`;
    txt += `   ⤷ Reembolso = ${dados.gFla.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    txt += `   ⤷ Lucro = ${dados.lucroFla.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;

    const fone = (destinatario === 'Arabela') ? '5581992147363' : '5581996914595';
    window.open(`https://api.whatsapp.com/send?phone=${fone}&text=${encodeURIComponent(txt)}`, '_blank');
};