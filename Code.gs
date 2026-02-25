/**
 * Occ-Health Emergency War Room
 * แยกออกมาเพื่อความรวดเร็วและเสถียร
 */

// ⚠️ สำคัญ: เนื่องจากแยกไฟล์มา ถ้าจะดึงข้อมูลจาก Sheet เดิม (เช่น รายชื่อเบอร์โทร) 
// แนะนำให้ใส่ ID ของ Google Sheet ตัวแม่ลงไปตรงนี้แทน getActiveSpreadsheet()
var MAIN_SHEET_ID = "ใส่_ID_ของ_GOOGLE_SHEET_ตัวหลัก_ที่นี่"; 
var ss = SpreadsheetApp.openById(MAIN_SHEET_ID); 

// ==========================================
// [1] การตั้งค่าและตัวแปรหลัก
// ==========================================
var ADMIN_PASSWORD = "882246"; // 🔐 รหัส Admin

// 🔑 Telegram Config
var TELEGRAM_TOKEN = "8349554549:AAE9reU225Nod4z_ONWZ_Ea6wQFaifbxOb4"; 
var TELEGRAM_CHAT_ID = "-1002490816700"; 
var WEB_APP_URL = "ใส่_URL_ของ_WEB_APP_ตัวใหม่_หลัง_DEPLOY"; 

// 📂 Folder IDs (เอาไว้เก็บรูปหลักฐาน)
var FOLDER_IDS = {
  "งานคลินิก": "15zzMm4HQCYXRVPRfIoHIIHwXEf1yuJ_s", 
  // ... (ใส่ ID อื่นๆ ถ้าจำเป็นต้องใช้) ...
};

// ==========================================
// [2] ฟังก์ชันเริ่มต้นระบบ (System Start)
// ==========================================

function doGet(e) {
  // บังคับเปิดหน้า Emergency ทันที
  return HtmlService.createTemplateFromFile('Emergency') 
      .evaluate()
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setTitle('🚨 Occ-Health War Room')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function checkAdminPass(input) {
  return input.toString() == ADMIN_PASSWORD.toString();
}

// ==========================================
// [3] ระบบ War Room Core (หัวใจหลัก)
// ==========================================

// 1. ประกาศ/ยกเลิก ภาวะฉุกเฉิน
function setEmergencyState(password, isActive, message) {
  if (password != ADMIN_PASSWORD) return "WrongPass";
  
  var props = PropertiesService.getScriptProperties();
  props.setProperty('EMERGENCY_ACTIVE', isActive);
  props.setProperty('EMERGENCY_MSG', message || "เกิดเหตุฉุกเฉิน!");
  
  if (isActive) {
    // Reset ค่าต่างๆ เมื่อเริ่มใหม่
    var defaultChecklist = [];
    for(var i=0; i<30; i++) defaultChecklist.push({status: false, file: null});
    props.setProperty('EMERGENCY_CHECKLIST', JSON.stringify(defaultChecklist));
    props.setProperty('EMERGENCY_CUSTOM_TASKS', "[]");
    
    var startLog = [{time: getTimeNow(), msg: "เริ่มเปิดศูนย์ War Room: " + message}];
    props.setProperty('EMERGENCY_LOGS', JSON.stringify(startLog));
    props.setProperty('EMERGENCY_ATTENDANCE', "[]");
    props.setProperty('EMERGENCY_HEADS', "{}"); 
    props.deleteProperty('RISK_DRAFTS');

    // Reset ยอดคน
    props.setProperty('Shelter_Pop', "0");
    props.setProperty('Shelter_Loc', "- รอระบุ -");
    props.setProperty('Muster_Staff', "0");
    props.setProperty('Muster_Patient', "0");
    props.setProperty('Muster_Loc', "- รอระบุ -");
    
    // Reset Triage
    props.deleteProperty('TRIAGE_RED');
    props.deleteProperty('TRIAGE_YELLOW');
    props.deleteProperty('TRIAGE_GREEN');
    props.deleteProperty('TRIAGE_BLACK');                

    // แจ้งเตือน Telegram
    var alertMsg = "🚨 *EMERGENCY ALERT!* 🚨\n\n" + 
                   "⚠️ *เหตุการณ์:* " + message + "\n\n" +
                   "🔴 *รายงานตัว และปฏิบัติตามแผน*\n" +
                   "🔗 [👉 กดเพื่อเข้าสู่ War Room](" + WEB_APP_URL + ")";
    try { sendTelegramMsg(alertMsg); } catch(e) {}

  } else {
    var cancelMsg = "✅ *ยกเลิกภาวะฉุกเฉิน*";
    try { sendTelegramMsg(cancelMsg); } catch(e) {}
  }
  return "Success";
}

// 2. ดึงสถานะปัจจุบัน (ใช้ polling หน้าเว็บ)
function getEmergencyState() {
  var props = PropertiesService.getScriptProperties();
  var fullState = JSON.parse(props.getProperty('EMERGENCY_STATE') || "{}");

  return {
    isActive: props.getProperty('EMERGENCY_ACTIVE') === 'true',
    message: props.getProperty('EMERGENCY_MSG'),
    checklist: JSON.parse(props.getProperty('EMERGENCY_CHECKLIST') || "[]"),
    customTasks: JSON.parse(props.getProperty('EMERGENCY_CUSTOM_TASKS') || "[]"), 
    logs: JSON.parse(props.getProperty('EMERGENCY_LOGS') || "[]"),
    attendance: JSON.parse(props.getProperty('EMERGENCY_ATTENDANCE') || "[]"),
    heads: JSON.parse(props.getProperty('EMERGENCY_HEADS') || "{}"),
    riskDrafts: JSON.parse(props.getProperty('RISK_DRAFTS') || "[]"),
    boxData: fullState.boxData || {} 
  };
}

// ==========================================
// [4] ระบบจัดการคนและการรายงานตัว (Attendance)
// ==========================================

function submitEmergencyAttendance(name, inputPin, roleText) {
  // เช็ค PIN (ยกเว้นรหัสพิเศษ)
  if (inputPin !== "1234" && inputPin !== "882246") {
      if (!verifyUserPin(name, inputPin)) {
        return "WrongPIN";
      }
  }

  var props = PropertiesService.getScriptProperties();
  var list = JSON.parse(props.getProperty('EMERGENCY_ATTENDANCE') || "[]");
  
  var index = list.findIndex(x => x.name == name);
  if (index !== -1) {
    list[index].role = roleText || "เจ้าหน้าที่";
    list[index].time = getTimeNow();
  } else {
    list.unshift({
      name: name,
      role: roleText || "เจ้าหน้าที่", 
      location: "", 
      time: getTimeNow()
    });
  }
  
  props.setProperty('EMERGENCY_ATTENDANCE', JSON.stringify(list));
  return list; 
}

function updateStaffLocation(name, location) {
  var props = PropertiesService.getScriptProperties();
  var list = JSON.parse(props.getProperty('EMERGENCY_ATTENDANCE') || "[]");
  var found = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i].name == name) {
      list[i].location = location;
      list[i].last_update = getTimeNow();
      found = true;
      break;
    }
  }
  if (!found) {
    list.unshift({ name: name, role: "ทีมสนับสนุน", location: location, time: getTimeNow() });
  }
  props.setProperty('EMERGENCY_ATTENDANCE', JSON.stringify(list));
  return "Success";
}

function updateStaffStatus(name, status) {
  var props = PropertiesService.getScriptProperties();
  var list = JSON.parse(props.getProperty('EMERGENCY_ATTENDANCE') || "[]");
  for (var i = 0; i < list.length; i++) {
    if (list[i].name == name) {
      list[i].status = status;
      list[i].time = getTimeNow();
      break;
    }
  }
  props.setProperty('EMERGENCY_ATTENDANCE', JSON.stringify(list));
  return list;
}

// ฟังก์ชันตรวจสอบ PIN (ดึงจาก Sheet Contacts)
function verifyUserPin(name, inputPin) {
  var sheetName = "Contacts"; 
  var sheet = ss.getSheetByName(sheetName); // ใช้ ss ที่ประกาศด้านบน (openById)
  if (!sheet) return true; 

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] == name) { 
      var phone = String(data[i][2]).replace(/-/g, "").trim(); 
      var storedPin = String(data[i][3]).trim(); 
      
      if (storedPin !== "" && storedPin !== "undefined") {
        return storedPin == inputPin;
      } 
      else if (phone.length >= 4) {
        var last4 = phone.substr(phone.length - 4);
        return last4 == inputPin;
      }
      return true;
    }
  }
  return false; 
}

// ==========================================
// [5] ระบบ Triage & สถานะเหตุการณ์
// ==========================================

function submitTriageReport(color, amount) {
  var props = PropertiesService.getScriptProperties();
  var key = 'TRIAGE_' + color.toUpperCase();
  var currentVal = parseInt(props.getProperty(key) || "0");
  var newVal = currentVal + parseInt(amount);
  if (newVal < 0) newVal = 0; 
  props.setProperty(key, newVal);
  return getTriageStats();
}

function getTriageStats() {
  var props = PropertiesService.getScriptProperties();
  return {
    red: parseInt(props.getProperty('TRIAGE_RED') || "0"),
    yellow: parseInt(props.getProperty('TRIAGE_YELLOW') || "0"),
    green: parseInt(props.getProperty('TRIAGE_GREEN') || "0"),
    black: parseInt(props.getProperty('TRIAGE_BLACK') || "0")
  };
}

// จัดการโหมด (Prep, MCI, Fire)
function saveActiveMode(modeConfig) {
  PropertiesService.getScriptProperties().setProperty('ACTIVE_MODE', JSON.stringify(modeConfig));
}
function getActiveMode() {
  var data = PropertiesService.getScriptProperties().getProperty('ACTIVE_MODE');
  return data ? JSON.parse(data) : { prep:true, mci:true, fire:true };
}

// รับค่าจากหน้า Staff
function updateEmerCount(type, val) {
  PropertiesService.getScriptProperties().setProperty(type, val.toString());
}
function updateShelterName(name) {
  PropertiesService.getScriptProperties().setProperty('Shelter_Loc', name);
}
function updateMusterName(name) {
  PropertiesService.getScriptProperties().setProperty('Muster_Loc', name);
}
function updateFireLocation(name) {
  PropertiesService.getScriptProperties().setProperty('Fire_Loc', name);
  return "Success";
}

function getLatestEmerData() {
  var p = PropertiesService.getScriptProperties();
  return {
    Shelter_Pop: p.getProperty('Shelter_Pop') || "0",
    Shelter_Loc: p.getProperty('Shelter_Loc') || "- รอระบุ -",
    Muster_Staff: p.getProperty('Muster_Staff') || "0",
    Muster_Patient: p.getProperty('Muster_Patient') || "0",
    Muster_Loc: p.getProperty('Muster_Loc') || "- รอระบุ -",
    Fire_Loc: p.getProperty('Fire_Loc') || "- รอระบุ -", 
    isActive: p.getProperty('EMERGENCY_ACTIVE') === 'true'
  };
}

// ==========================================
// [6] ระบบ Checklist & Custom Tasks
// ==========================================

function updateChecklist(password, index, isChecked) {
  var props = PropertiesService.getScriptProperties();
  var checklist = JSON.parse(props.getProperty('EMERGENCY_CHECKLIST') || "[]");
  if (!checklist[index] || typeof checklist[index] !== 'object') {
    checklist[index] = { status: isChecked, file: null };
  } else {
    checklist[index].status = isChecked;
  }
  props.setProperty('EMERGENCY_CHECKLIST', JSON.stringify(checklist));
  return checklist;
}

function addCustomTask(taskName) {
  var props = PropertiesService.getScriptProperties();
  var tasks = JSON.parse(props.getProperty('EMERGENCY_CUSTOM_TASKS') || "[]");
  tasks.push({ id: new Date().getTime(), name: taskName, status: false, file: null });
  props.setProperty('EMERGENCY_CUSTOM_TASKS', JSON.stringify(tasks));
  return tasks;
}

function updateCustomTask(index, isChecked) {
  var props = PropertiesService.getScriptProperties();
  var tasks = JSON.parse(props.getProperty('EMERGENCY_CUSTOM_TASKS') || "[]");
  if (tasks[index]) {
    tasks[index].status = isChecked;
    props.setProperty('EMERGENCY_CUSTOM_TASKS', JSON.stringify(tasks));
  }
  return tasks;
}

function deleteCustomTask(index) {
  var props = PropertiesService.getScriptProperties();
  var tasks = JSON.parse(props.getProperty('EMERGENCY_CUSTOM_TASKS') || "[]");
  if (index >= 0 && index < tasks.length) {
    tasks.splice(index, 1);
    props.setProperty('EMERGENCY_CUSTOM_TASKS', JSON.stringify(tasks));
  }
  return tasks;
}

// ==========================================
// [7] ระบบ Log, สื่อสาร & Upload
// ==========================================

function addCommanderLog(msg, imgUrl, fileUrl) { 
  var props = PropertiesService.getScriptProperties();
  var logs = JSON.parse(props.getProperty('EMERGENCY_LOGS') || "[]");
  logs.unshift({ time: getTimeNow(), msg: msg, imgUrl: imgUrl || "", fileUrl: fileUrl || "" });
  if (logs.length > 50) logs.pop();
  props.setProperty('EMERGENCY_LOGS', JSON.stringify(logs));
  return logs;
}

function editCommanderLog(password, index, newMsg) {
  if (password != ADMIN_PASSWORD) return "WrongPass";
  var props = PropertiesService.getScriptProperties();
  var logs = JSON.parse(props.getProperty('EMERGENCY_LOGS') || "[]");
  if (index >= 0 && index < logs.length) {
    logs[index].msg = newMsg;
    props.setProperty('EMERGENCY_LOGS', JSON.stringify(logs));
  }
  return logs;
}

function deleteCommanderLog(password, index) {
  if (password != ADMIN_PASSWORD) return "WrongPass";
  var props = PropertiesService.getScriptProperties();
  var logs = JSON.parse(props.getProperty('EMERGENCY_LOGS') || "[]");
  if (index >= 0 && index < logs.length) {
    logs.splice(index, 1);
    props.setProperty('EMERGENCY_LOGS', JSON.stringify(logs));
  }
  return logs;
}

function acknowledgeLogItem(index) {
  var props = PropertiesService.getScriptProperties();
  var logs = JSON.parse(props.getProperty('EMERGENCY_LOGS') || "[]");
  if (logs[index]) {
    logs[index].ack = true; 
    props.setProperty('EMERGENCY_LOGS', JSON.stringify(logs));
  }
  return logs;
}

function completeRequest(logIndex) {
  var props = PropertiesService.getScriptProperties();
  var logs = JSON.parse(props.getProperty('EMERGENCY_LOGS') || "[]");
  if (logs[logIndex]) {
    logs[logIndex].completed = true; 
    logs[logIndex].msg += " ✅ (ได้รับสนับสนุนแล้ว)"; 
    props.setProperty('EMERGENCY_LOGS', JSON.stringify(logs));
  }
  return logs;
}

// Upload Evidence (หลักฐาน Checklist)
function uploadEmergencyEvidence(data) {
  var props = PropertiesService.getScriptProperties();
  var checklist = JSON.parse(props.getProperty('EMERGENCY_CHECKLIST') || "[]");
  
  var folderName = "WarRoom_Evidence";
  var folder = getOrCreateFolderByName(folderName);
  
  var blob = Utilities.newBlob(Utilities.base64Decode(data.fileData), data.mimeType, data.fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); 
  var viewUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
  
  if (data.index >= 0) {
    if (!checklist[data.index] || typeof checklist[data.index] !== 'object') {
      checklist[data.index] = { status: true, file: null };
    }
    checklist[data.index].file = { name: data.fileName, url: viewUrl, id: file.getId() };
    checklist[data.index].status = true; 
    props.setProperty('EMERGENCY_CHECKLIST', JSON.stringify(checklist));
  }
  
  return { checklist: checklist, uploadedUrl: viewUrl };
}

function deleteEmergencyEvidence(index) {
  var props = PropertiesService.getScriptProperties();
  var checklist = JSON.parse(props.getProperty('EMERGENCY_CHECKLIST') || "[]");
  if (checklist[index] && checklist[index].file) {
    checklist[index].file = null; 
    props.setProperty('EMERGENCY_CHECKLIST', JSON.stringify(checklist));
  }
  return checklist;
}

// Upload War Room Box Image
function uploadWarRoomImage(base64, mimeType, boxKey, message) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, "warroom_" + boxKey + "_" + new Date().getTime());
  var folderId = FOLDER_IDS["งานคลินิก"]; 
  var folder = DriveApp.getFolderById(folderId); // หรือใช้ getOrCreateFolderByName ก็ได้
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
  updateWarRoomBox(boxKey, message, fileUrl, 'pending');
  return "OK";
}

function updateWarRoomBox(key, msg, img, status) {
  var props = PropertiesService.getScriptProperties();
  var stateJson = props.getProperty("EMERGENCY_STATE");
  var state = stateJson ? JSON.parse(stateJson) : {};
  if (!state.boxData) state.boxData = {};
  
  if (msg === "" && img === "" && status === "") {
    delete state.boxData[key]; 
  } else {
    var current = state.boxData[key] || {};
    state.boxData[key] = {
      msg: msg || current.msg, 
      img: img || current.img, 
      updated: Utilities.formatDate(new Date(), "GMT+7", "HH:mm"),
      status: status || 'pending'
    };
  }
  props.setProperty("EMERGENCY_STATE", JSON.stringify(state));
  return "OK";
}

// ==========================================
// [8] ร่างแถลงการณ์ความเสี่ยง & หัวหน้าจุด
// ==========================================

function submitRiskDraft(msg) {
  var props = PropertiesService.getScriptProperties();
  var drafts = JSON.parse(props.getProperty('RISK_DRAFTS') || "[]");
  drafts.unshift({ time: getTimeNow(), msg: msg, status: 'pending' });
  if (drafts.length > 20) drafts.pop(); 
  props.setProperty('RISK_DRAFTS', JSON.stringify(drafts));
  return drafts; 
}
function getRiskDrafts() {
  var props = PropertiesService.getScriptProperties();
  return JSON.parse(props.getProperty('RISK_DRAFTS') || "[]");
}
function approveRiskDraft(index) {
  var props = PropertiesService.getScriptProperties();
  var drafts = JSON.parse(props.getProperty('RISK_DRAFTS') || "[]");
  if (drafts[index]) {
    drafts[index].status = 'approved'; 
    delete drafts[index].comment;
    props.setProperty('RISK_DRAFTS', JSON.stringify(drafts));
  }
  return drafts;
}
function rejectRiskDraft(index, comment) {
  var props = PropertiesService.getScriptProperties();
  var drafts = JSON.parse(props.getProperty('RISK_DRAFTS') || "[]");
  if (drafts[index]) {
    drafts[index].status = 'rejected';
    drafts[index].comment = comment; 
    props.setProperty('RISK_DRAFTS', JSON.stringify(drafts));
  }
  return drafts;
}
function acknowledgeRiskDraft(index) {
  var props = PropertiesService.getScriptProperties();
  var drafts = JSON.parse(props.getProperty('RISK_DRAFTS') || "[]");
  if (drafts[index]) {
    drafts[index].status = 'acknowledged'; 
    props.setProperty('RISK_DRAFTS', JSON.stringify(drafts));
  }
  return drafts;
}
function deleteRiskDraft(index) {
  var props = PropertiesService.getScriptProperties();
  var drafts = JSON.parse(props.getProperty('RISK_DRAFTS') || "[]");
  if (index >= 0 && index < drafts.length) {
    drafts.splice(index, 1); 
    props.setProperty('RISK_DRAFTS', JSON.stringify(drafts));
  }
  return drafts;
}

function updateZoneHead(zoneKey, name) {
  var props = PropertiesService.getScriptProperties();
  var heads = JSON.parse(props.getProperty('EMERGENCY_HEADS') || "{}");
  heads[zoneKey] = name;
  props.setProperty('EMERGENCY_HEADS', JSON.stringify(heads));
  return heads; 
}

// ==========================================
// [9] Helpers
// ==========================================

function sendTelegramMsg(msg) {
  var url = "https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage";
  var payload = { "chat_id": TELEGRAM_CHAT_ID, "text": msg, "parse_mode": "Markdown" };
  var options = { "method": "post", "contentType": "application/json", "payload": JSON.stringify(payload) };
  try { UrlFetchApp.fetch(url, options); } catch(e) { console.log(e); }
}

function getTimeNow() {
  var d = new Date();
  return Utilities.formatDate(d, "Asia/Bangkok", "HH:mm");
}

function getOrCreateFolderByName(folderName) {
  try {
    var mainFolderName = "OccDC"; 
    var parentFolder;
    var parents = DriveApp.getFoldersByName(mainFolderName);
    if (parents.hasNext()) {
      parentFolder = parents.next();
    } else {
      parentFolder = DriveApp.createFolder(mainFolderName);
    }
    var targets = parentFolder.getFoldersByName(folderName);
    if (targets.hasNext()) {
      return targets.next(); 
    } else {
      return parentFolder.createFolder(folderName); 
    }
  } catch (e) {
    return DriveApp.getRootFolder(); 
  }
}
