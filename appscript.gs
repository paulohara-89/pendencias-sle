// ==========================================
// CÓDIGO DO GOOGLE APPS SCRIPT (BACKEND)
// ==========================================
// 1. Abra o Editor de Script na sua planilha (Extensões > Apps Script)
// 2. Apague tudo e cole o código abaixo
// 3. Clique em "Implantar" > "Nova implantação"
// 4. Selecione "App da Web", defina "Qualquer pessoa" e Implante
// 5. Autorize e copie a nova "URL do App da Web"
// ==========================================

const SHEETS = {
  BASE: "CTE",           // Página principal de CTEs
  NOTES: "NOTES",        // Página de Anotações/Arquivos
  USERS: "USERS",        // Página de Usuários
  DATA: "DATA",          // Página Auxiliar Global
  PROFILES: "PROFILES",  // Página de Perfis de permissão
  PROCESS: "PROCESS_CONTROL" // Tabela de logs do processo
};

// ID DA PASTA NO GOOGLE DRIVE PARA SALVAR OS ANEXOS
// Crie uma pasta no seu Google Drive, clique com o botão direito -> "Gerar Link"
// Deixe "Qualquer pessoa com o link" (Leitor).
// O ID da pasta é o trecho após "folders/" na URL.
// Cole o ID na variável abaixo:
const UPLOAD_FOLDER_ID = "COLE_O_ID_DA_SUA_PASTA_AQUI"; 

function formatTimestamp(date) {
  if (!date) date = new Date();
  var d = ('0' + date.getDate()).slice(-2);
  var m = ('0' + (date.getMonth() + 1)).slice(-2);
  var y = date.getFullYear();
  var h = ('0' + date.getHours()).slice(-2);
  var min = ('0' + date.getMinutes()).slice(-2);
  var sec = ('0' + date.getSeconds()).slice(-2);
  return d + '/' + m + '/' + y + ' ' + h + ':' + min + ':' + sec;
}

// Para requisições da web
function doGet(e) {
  return generateResponse({ success: true, message: "Dec Log Backend Actived!" });
}

function doPost(e) {
  try {
    // Tratamento cors
    const origin = e.parameter.origin || '*';
    if (!e.postData || !e.postData.contents) {
      return generateResponse({ success: false, message: "No data payload" });
    }

    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const payload = requestData.payload;

    var result;
    switch(action) {
      case "addNote":
        result = addNote(payload);
        break;
      case "deleteNote":
        result = deleteNote(payload);
        break;
      case "resolveIssue":
        result = resolveIssue(payload);
        break;
      case "addUser":
        result = addUser(payload);
        break;
      case "deleteUser":
        result = deleteUser(payload);
        break;
      case "saveProfile":
         result = saveProfile(payload);
         break;
      case "deleteProfile":
         result = deleteProfile(payload);
         break;
      default:
        result = { success: false, message: "Action Unknown" };
    }
    return generateResponse(result);
  } catch (error) {
    return generateResponse({ success: false, error: String(error) });
  }
}

function generateResponse(data) {
  const content = JSON.stringify(data);
  return ContentService.createTextOutput(content)
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------
// UPLOAD DE IMAGEM PARA O DRIVE COM LINK DE VISUALIZAÇÃO
// ------------------------------------------
function uploadImageToDrive(p) {
  try {
    const folderId = UPLOAD_FOLDER_ID;
    if (folderId === "COLE_O_ID_DA_SUA_PASTA_AQUI") {
       throw new Error("ID da pasta não configurado no Apps Script!");
    }
    const folder = DriveApp.getFolderById(folderId);
    
    let base64Data = "";
    if (typeof p.data === 'string') {
        base64Data = p.data;
    } else if (typeof p.image === 'string') {
        base64Data = p.image;
    } else if (typeof p === 'string') {
        base64Data = p;
    } else {
        return { success: false, message: "Payload de arquivo inválido" };
    }

    let contentType = "application/octet-stream";
    let extension = "bin";

    if (base64Data.includes("base64,")) {
        const parts = base64Data.split(";base64,");
        const header = parts[0]; 
        if (header.includes("data:")) {
            contentType = header.replace("data:", "").trim();
        }
        base64Data = parts[parts.length - 1]; 
    }
    
    // Fallback based on param name
    if (!p.fileName) {
       if (contentType.includes("jpeg") || contentType.includes("jpg")) extension = "jpg";
       else if (contentType.includes("png")) extension = "png";
       else if (contentType.includes("pdf")) extension = "pdf";
       else if (contentType.includes("mp4")) extension = "mp4";
    }

    const fileName = p.fileName || `anexo_${new Date().getTime()}.${extension}`;
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, fileName);
    const file = folder.createFile(blob);
    
    // IMPORTANTE: Definir como visível para visualizar no frontend!
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Gerar os Links
    const rawId = file.getId();
    const drivePreviewUrl = "https://drive.google.com/file/d/" + rawId + "/preview";
    
    return { 
        success: true, 
        url: drivePreviewUrl,
        viewUrl: drivePreviewUrl,
        id: file.getId(),
        mimeType: contentType
    };
  } catch (e) {
    Logger.log("Falha no Upload Drive: " + String(e));
    return { success: false, error: String(e) };
  }
}

function processTrackingStatus(cte, serie, newStatus, user, description, link) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetProcess = ss.getSheetByName(SHEETS.PROCESS);
    var sheetCte = ss.getSheetByName(SHEETS.BASE);
    
    if (sheetProcess) {
       var processId = Utilities.getUuid();
       var timestamp = formatTimestamp();
       sheetProcess.appendRow([
          processId, cte, serie, timestamp, user, description, link, newStatus
       ]);
    }
    
    if (sheetCte && (newStatus === "EM BUSCA" || newStatus === "TAD" || newStatus === "RESOLVIDO" || newStatus === "LOCALIZADA")) {
       var data = sheetCte.getDataRange().getValues();
       var header = data[0];
       var cteIdx = header.findIndex(h => String(h).toUpperCase().includes("CTE"));
       var serieIdx = header.findIndex(h => String(h).toUpperCase().includes("SERIE"));
       var statusIdx = header.findIndex(h => String(h).toUpperCase() === "STATUS");
       
       if (cteIdx >= 0 && statusIdx >= 0) {
          for (var i = 1; i < data.length; i++) {
             var rowCte = String(data[i][cteIdx]).trim();
             var rowSerie = serieIdx >= 0 ? String(data[i][serieIdx]).replace(/^0+/, '').trim() : "";
             var inputSerie = String(serie || '').replace(/^0+/, '').trim();
             
             if (rowCte === String(cte).trim() && (rowSerie === inputSerie || !inputSerie)) {
                sheetCte.getRange(i + 1, statusIdx + 1).setValue(newStatus);
             }
          }
       }
    }
}

function addNote(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var finalCte = payload.cte || "";
  var finalSerie = payload.serie || "";
  var finalCod = payload.codigo || "";
  var noteAuthor = payload.user || payload.username || "Sistema";
  var noteText = payload.text || payload.description || "Sem descrição";
  var markInSearchActivelyRequested = !!payload.markInSearch || payload.status_busca === "EM BUSCA";
  var markTadActivelyRequested = !!payload.isTad || payload.status_busca === "TAD";
  var finalStringArgs = "";
  var finalUrls = [];
  
  // Tratamento de anexos que chegam em Base64 para arquivar no Google Drive
  let filesToProcess = [];
  
  if (payload.attachments && Array.isArray(payload.attachments)) {
      filesToProcess = payload.attachments;
  } else if (payload.image && String(payload.image).length > 250) {
      filesToProcess.push(payload.image);
  }

  if (filesToProcess.length > 0) {
      filesToProcess.forEach((item, index) => {
           try {
               const strData = (typeof item === 'object' && item.data) ? item.data : item;
               const customName = (typeof item === 'object' && item.fileName) 
                                  ? item.fileName 
                                  : `anexo_${index}_${new Date().getTime()}`;
               
               if (String(strData).length > 250 && !String(strData).startsWith("http")) {
                   let uploadRes = uploadImageToDrive({ data: strData, fileName: customName });
                   if (uploadRes.success) finalUrls.push(uploadRes.url);
               } 
               else if (String(strData).startsWith("http")) {
                   finalUrls.push(strData);
               }
           } catch(err) {
               Logger.log("Erro individual de anexo: " + String(err));
           }
      });
  }

  finalStringArgs = finalUrls.length > 0 ? finalUrls.join(" , ") : "";
  var id = Utilities.getUuid();
  var ts = formatTimestamp(new Date());

  var requestedStatus = "";
  if (markTadActivelyRequested) requestedStatus = "TAD";
  else if (markInSearchActivelyRequested) requestedStatus = "EM BUSCA";

  ss.getSheetByName(SHEETS.NOTES).appendRow([
    id, finalCte, finalSerie, finalCod, ts, 
    noteAuthor, noteText, finalStringArgs, requestedStatus
  ]);

  if (requestedStatus) {
      processTrackingStatus(finalCte, finalSerie, requestedStatus, noteAuthor, "Status via App", finalStringArgs);
  }

  return { success: true, id: id, timestamp: ts };
}

function deleteNote(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.NOTES);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(payload.id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: "Note not found" };
}

function resolveIssue(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cte = payload.cte;
  var serie = payload.serie || "";
  var user = payload.user || payload.username || "Sistema";
  var text = payload.text || "RESOLVIDO / LOCALIZADA";
  
  processTrackingStatus(cte, serie, "RESOLVIDO", user, text, "");
  return { success: true };
}

function addUser(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.USERS);
  sh.appendRow([
    payload.username, payload.password, payload.role, payload.linkedOriginUnit, payload.linkedDestUnit
  ]);
  return { success: true };
}

function deleteUser(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.USERS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == payload.username) {
      sh.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false };
}

function saveProfile(payload) {
    if(!payload.name) return {success: false, message: "Missing Name"};
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.PROFILES);
    var data = sheet.getDataRange().getValues();
    var permsStr = Array.isArray(payload.permissions) ? payload.permissions.join(', ') : payload.permissions;

    for (var i = 1; i < data.length; i++) {
        if (data[i][0] === payload.name) {
             sheet.getRange(i+1, 2).setValue(payload.description || "");
             sheet.getRange(i+1, 3).setValue(permsStr || "");
             return {success: true, message: "Updated"};
        }
    }
    sheet.appendRow([payload.name, payload.description || "", permsStr || ""]);
    return {success: true, message: "Created"};
}

function deleteProfile(payload) {
    if(!payload.name) return {success: false, message: "Missing Name"};
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.PROFILES);
    var data = sheet.getDataRange().getValues();
    for(var i = 1; i < data.length; i++) {
        if(data[i][0] === payload.name) {
             sheet.deleteRow(i+1);
             return {success: true};
        }
    }
    return {success: false, message: "Not found"};
}
