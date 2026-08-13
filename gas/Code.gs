/**
 * Culture-Fit Google Sheets 운영 도구
 *
 * 사용 방법:
 * 1. 검사에 사용할 Google Spreadsheet를 엽니다.
 * 2. 확장 프로그램 > Apps Script에서 이 파일의 내용을 Code.gs에 붙여넣습니다.
 * 3. setupCultureFitWorkbook()을 한 번 실행하고 권한을 승인합니다.
 * 4. 스프레드시트를 새로고침하면 "Culture-Fit 운영" 메뉴가 표시됩니다.
 *
 * 이 스크립트는 기존 응답 행을 삭제하지 않습니다. 데이터가 있는 시트의 헤더가
 * 패키지 정의와 다르면 열 정렬 사고를 막기 위해 중단하고 운영자에게 알립니다.
 */

var CF = Object.freeze({
  TIME_ZONE: 'Asia/Seoul',
  CANDIDATE_SHEET: 'Candidates',
  EVENT_SHEET: 'EventLogs',
  GUIDE_SHEET: '운영가이드',
  RESPONSE_SHEETS: ['Responses', 'Responses_V2', 'Responses_V2_Bank'],
  CANDIDATE_HEADERS: [
    'email', 'name', 'phone', 'allow', 'start_at', 'end_at', 'status',
    'invited_at', 'started_at', 'completed_at'
  ],
  RESPONSE_BASE_HEADERS: [
    'Session ID', 'Name', 'Email', 'Phone', 'Timestamp', 'Status',
    'Time Spent', 'Completion', 'Focus Out Count', 'Forced Submit',
    'Pattern Warning', 'Notes', 'Score'
  ],
  EVENT_HEADERS: ['timestamp', 'sessionId', 'eventType', 'data'],
  CANDIDATE_STATUSES: ['INVITED', 'STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'],
  DEFAULT_ROWS: 1000
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Culture-Fit 운영')
    .addItem('1. 전체 초기 설정', 'setupCultureFitWorkbook')
    .addItem('2. 구성 점검', 'validateCultureFitWorkbook')
    .addItem('3. 헤더·서식 복구', 'repairCultureFitWorkbook')
    .addSeparator()
    .addItem('지원자 1명 추가', 'addCandidateWithPrompt')
    .addItem('선택 지원자 응시 허용', 'allowSelectedCandidates')
    .addItem('선택 지원자 응시 차단', 'blockSelectedCandidates')
    .addItem('선택 지원자 재응시 초기화', 'resetSelectedCandidates')
    .addSeparator()
    .addItem('스프레드시트 ID 보기', 'showSpreadsheetId')
    .addToUi();
}

function setupCultureFitWorkbook() {
  withDocumentLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.setSpreadsheetTimeZone(CF.TIME_ZONE);

    var candidates = ensureSheet_(ss, CF.CANDIDATE_SHEET, CF.CANDIDATE_HEADERS);
    var responsesV1 = ensureSheet_(ss, 'Responses', responseHeaders_(legacyItemIds_()));
    var responsesV2 = ensureSheet_(ss, 'Responses_V2', responseHeaders_(v2PilotItemIds_()));
    var responsesV2Bank = ensureSheet_(ss, 'Responses_V2_Bank', responseHeaders_(v2BankItemIds_()));
    var eventLogs = ensureSheet_(ss, CF.EVENT_SHEET, CF.EVENT_HEADERS);

    formatCandidates_(candidates);
    [responsesV1, responsesV2, responsesV2Bank].forEach(formatResponses_);
    formatEventLogs_(eventLogs);
    writeOperationsGuide_(ss);

    PropertiesService.getDocumentProperties().setProperties({
      CULTURE_FIT_SCHEMA_VERSION: '2.0.0',
      CULTURE_FIT_LAST_SETUP_AT: new Date().toISOString()
    });

    ss.toast('필수 탭, 헤더, 입력 규칙과 운영 가이드를 준비했습니다.', 'Culture-Fit', 8);
  });
}

function repairCultureFitWorkbook() {
  setupCultureFitWorkbook();
  validateCultureFitWorkbook();
}

function validateCultureFitWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var issues = [];
  var definitions = [
    [CF.CANDIDATE_SHEET, CF.CANDIDATE_HEADERS],
    ['Responses', responseHeaders_(legacyItemIds_())],
    ['Responses_V2', responseHeaders_(v2PilotItemIds_())],
    ['Responses_V2_Bank', responseHeaders_(v2BankItemIds_())],
    [CF.EVENT_SHEET, CF.EVENT_HEADERS]
  ];

  definitions.forEach(function (definition) {
    var sheet = ss.getSheetByName(definition[0]);
    if (!sheet) {
      issues.push('필수 탭 없음: ' + definition[0]);
      return;
    }
    var expected = definition[1];
    if (sheet.getMaxColumns() < expected.length) {
      issues.push(definition[0] + ': 열 수 부족 (' + sheet.getMaxColumns() + '/' + expected.length + ')');
      return;
    }
    var actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
    var mismatch = firstMismatch_(actual, expected);
    if (mismatch >= 0) {
      issues.push(definition[0] + ': ' + columnLetter_(mismatch + 1) + '1 헤더 불일치');
    }
  });

  if (ss.getSpreadsheetTimeZone() !== CF.TIME_ZONE) {
    issues.push('시간대가 Asia/Seoul이 아닙니다: ' + ss.getSpreadsheetTimeZone());
  }
  validateCandidates_(ss.getSheetByName(CF.CANDIDATE_SHEET), issues);

  var ui = SpreadsheetApp.getUi();
  if (issues.length === 0) {
    ui.alert('Culture-Fit 구성 점검', '필수 구성과 지원자 데이터에 문제가 없습니다.', ui.ButtonSet.OK);
    return;
  }
  var shown = issues.slice(0, 30);
  if (issues.length > shown.length) shown.push('그 외 ' + (issues.length - shown.length) + '건');
  ui.alert('Culture-Fit 구성 점검: ' + issues.length + '건', shown.join('\n'), ui.ButtonSet.OK);
}

function addCandidateWithPrompt() {
  var ui = SpreadsheetApp.getUi();
  var email = promptRequired_(ui, '지원자 추가 (1/5)', '이메일을 입력하세요.');
  if (email === null) return;
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    ui.alert('올바른 이메일 형식이 아닙니다.');
    return;
  }

  var name = promptRequired_(ui, '지원자 추가 (2/5)', '이름을 입력하세요.');
  if (name === null) return;
  var phone = promptRequired_(ui, '지원자 추가 (3/5)', '휴대폰 번호를 입력하세요.');
  if (phone === null) return;

  var startText = promptOptional_(ui, '지원자 추가 (4/5)', '응시 시작 시각을 입력하세요.\n예: 2026-08-13 09:00\n제한하지 않으려면 비워두세요.');
  if (startText === null) return;
  var endText = promptOptional_(ui, '지원자 추가 (5/5)', '응시 종료 시각을 입력하세요.\n예: 2026-08-13 18:00\n제한하지 않으려면 비워두세요.');
  if (endText === null) return;

  var startAt = parseKoreanDate_(startText);
  var endAt = parseKoreanDate_(endText);
  if ((startText && !startAt) || (endText && !endAt)) {
    ui.alert('날짜 형식 오류', '날짜는 YYYY-MM-DD HH:mm 형식으로 입력하세요.', ui.ButtonSet.OK);
    return;
  }
  if (startAt && endAt && endAt <= startAt) {
    ui.alert('응시 종료 시각은 시작 시각보다 늦어야 합니다.');
    return;
  }

  withDocumentLock_(function () {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CF.CANDIDATE_SHEET);
    if (!sheet) throw new Error('Candidates 탭이 없습니다. 먼저 전체 초기 설정을 실행하세요.');
    var duplicateRow = findCandidateRowByEmail_(sheet, email);
    if (duplicateRow) throw new Error('이미 등록된 이메일입니다. Candidates!' + duplicateRow + '행을 확인하세요.');
    sheet.appendRow([email, name.trim(), normalizePhone_(phone), true, startAt || '', endAt || '', 'INVITED', new Date(), '', '']);
  });
  ui.alert('지원자 등록 완료', email + ' 계정을 응시 허용 상태로 등록했습니다.', ui.ButtonSet.OK);
}

function allowSelectedCandidates() {
  updateSelectedCandidates_(true, null);
}

function blockSelectedCandidates() {
  updateSelectedCandidates_(false, 'BLOCKED');
}

function resetSelectedCandidates() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    '재응시 초기화',
    '선택한 지원자의 상태와 시작·완료 시각만 초기화합니다. 기존 Responses 응답 행은 삭제하지 않습니다. 계속할까요?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  var context = selectedCandidateRows_();
  context.rows.forEach(function (row) {
    context.sheet.getRange(row, 4).setValue(true);
    context.sheet.getRange(row, 7).setValue('INVITED');
    context.sheet.getRange(row, 9, 1, 2).clearContent();
  });
  SpreadsheetApp.getActiveSpreadsheet().toast(context.rows.length + '명의 재응시 상태를 초기화했습니다.', 'Culture-Fit', 6);
}

function showSpreadsheetId() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.getUi().alert(
    'SHEET_ID',
    ss.getId() + '\n\n이 값을 웹 애플리케이션의 SHEET_ID 환경 변수에 입력하세요.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  ensureDimensions_(sheet, CF.DEFAULT_ROWS, headers.length);
  ensureHeader_(sheet, headers);
  sheet.setFrozenRows(1);
  return sheet;
}

function ensureDimensions_(sheet, minRows, minColumns) {
  if (sheet.getMaxRows() < minRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), minRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < minColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), minColumns - sheet.getMaxColumns());
  }
}

function ensureHeader_(sheet, headers) {
  var existing = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  var hasHeader = existing.some(function (value) { return value !== ''; });
  var mismatch = firstMismatch_(existing, headers);
  if (hasHeader && mismatch >= 0 && sheet.getLastRow() > 1) {
    throw new Error(
      sheet.getName() + ' 탭에 데이터가 있지만 ' + columnLetter_(mismatch + 1) +
      '1 헤더가 예상값과 다릅니다. 데이터를 백업한 뒤 헤더를 수동으로 확인하세요.'
    );
  }
  if (!hasHeader || mismatch >= 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  styleHeader_(sheet, headers.length);
}

function styleHeader_(sheet, columnCount) {
  sheet.getRange(1, 1, 1, columnCount)
    .setBackground('#0f766e')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setRowHeight(1, 42);
}

function formatCandidates_(sheet) {
  var bodyRows = sheet.getMaxRows() - 1;
  sheet.setFrozenColumns(4);
  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 75);
  sheet.setColumnWidths(5, 2, 145);
  sheet.setColumnWidth(7, 110);
  sheet.setColumnWidths(8, 3, 145);
  sheet.getRange(2, 1, bodyRows, 3).setNumberFormat('@');
  sheet.getRange(2, 5, bodyRows, 2).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(2, 8, bodyRows, 3).setNumberFormat('yyyy-mm-dd hh:mm:ss');

  var checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build();
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CF.CANDIDATE_STATUSES, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 4, bodyRows, 1).setDataValidation(checkboxRule);
  sheet.getRange(2, 7, bodyRows, 1).setDataValidation(statusRule);

  if (!sheet.getFilter()) sheet.getRange(1, 1, sheet.getMaxRows(), CF.CANDIDATE_HEADERS.length).createFilter();
  if (sheet.getConditionalFormatRules().length === 0) {
    var statusRange = sheet.getRange(2, 7, bodyRows, 1);
    sheet.setConditionalFormatRules([
      textRule_(statusRange, 'COMPLETED', '#dcfce7'),
      textRule_(statusRange, 'IN_PROGRESS', '#dbeafe'),
      textRule_(statusRange, 'STARTED', '#e0f2fe'),
      textRule_(statusRange, 'BLOCKED', '#fee2e2')
    ]);
  }
}

function formatResponses_(sheet) {
  var columns = sheet.getLastColumn();
  sheet.setFrozenColumns(4);
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 210);
  sheet.setColumnWidth(4, 140);
  sheet.setColumnWidth(5, 155);
  sheet.setColumnWidths(6, 7, 115);
  sheet.setColumnWidth(12, 260);
  sheet.setColumnWidth(13, 260);
  if (columns > 13) sheet.setColumnWidths(14, columns - 13, 82);
  sheet.getRange(2, 5, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  protectWithWarning_(sheet, 'Culture-Fit 응답 원본: 웹 애플리케이션이 기록하므로 직접 수정에 주의하세요.');
}

function formatEventLogs_(sheet) {
  sheet.setColumnWidth(1, 165);
  sheet.setColumnWidth(2, 240);
  sheet.setColumnWidth(3, 180);
  sheet.setColumnWidth(4, 420);
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  protectWithWarning_(sheet, 'Culture-Fit 이벤트 원본: 웹 애플리케이션이 기록하므로 직접 수정에 주의하세요.');
}

function protectWithWarning_(sheet, description) {
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var exists = protections.some(function (protection) {
    return protection.getDescription() === description;
  });
  if (!exists) sheet.protect().setDescription(description).setWarningOnly(true);
}

function writeOperationsGuide_(ss) {
  var sheet = ss.getSheetByName(CF.GUIDE_SHEET) || ss.insertSheet(CF.GUIDE_SHEET);
  var rows = [
    ['Culture-Fit 운영 설정', '값 / 설명'],
    ['Spreadsheet ID', ss.getId()],
    ['시간대', CF.TIME_ZONE],
    ['권장 검사 버전', 'v2-bank-pilot'],
    ['지원자 화면', '배포 주소 /'],
    ['관리자 화면', '배포 주소 /admin'],
    ['필수 환경 변수', 'SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON, SESSION_SECRET, DIAGNOSTICS_TOKEN'],
    ['서비스 계정 권한', '이 스프레드시트의 편집자로 공유'],
    ['지원자 등록', 'Candidates 탭 또는 Culture-Fit 운영 > 지원자 1명 추가'],
    ['allow', 'TRUE이면 응시 허용, FALSE이면 차단'],
    ['응시 시간 형식', '한국 시간 기준 yyyy-mm-dd hh:mm'],
    ['응답 원본', 'Responses / Responses_V2 / Responses_V2_Bank'],
    ['이벤트 원본', 'EventLogs'],
    ['주의', '응답 및 이벤트 탭의 행과 열은 운영 중 직접 이동하거나 삭제하지 마세요.'],
    ['마지막 설정', Utilities.formatDate(new Date(), CF.TIME_ZONE, 'yyyy-MM-dd HH:mm:ss')]
  ];
  ensureDimensions_(sheet, rows.length, 2);
  sheet.clear();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows).setVerticalAlignment('top').setWrap(true);
  sheet.getRange(1, 1, 1, 2).setBackground('#0f766e').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold').setBackground('#f0fdfa');
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 560);
  sheet.setFrozenRows(1);
}

function validateCandidates_(sheet, issues) {
  if (!sheet || sheet.getLastRow() < 2) return;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  var emails = {};
  values.forEach(function (row, index) {
    var rowNumber = index + 2;
    var email = String(row[0] || '').trim().toLowerCase();
    var name = String(row[1] || '').trim();
    var phone = normalizePhone_(row[2]);
    if (!email && !name && !phone) return;
    if (!email || !name || !phone) issues.push('Candidates!' + rowNumber + ': 이메일·이름·전화번호 중 누락값 있음');
    if (email) {
      if (emails[email]) issues.push('Candidates!' + rowNumber + ': 중복 이메일 (' + email + ')');
      emails[email] = true;
    }
    if (row[4] && row[5] && new Date(row[5]) <= new Date(row[4])) {
      issues.push('Candidates!' + rowNumber + ': 종료 시각이 시작 시각보다 빠름');
    }
  });
}

function updateSelectedCandidates_(allowed, status) {
  var context = selectedCandidateRows_();
  context.rows.forEach(function (row) {
    context.sheet.getRange(row, 4).setValue(allowed);
    if (status) context.sheet.getRange(row, 7).setValue(status);
  });
  SpreadsheetApp.getActiveSpreadsheet().toast(
    context.rows.length + '명의 응시를 ' + (allowed ? '허용' : '차단') + '했습니다.',
    'Culture-Fit',
    6
  );
}

function selectedCandidateRows_() {
  var sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== CF.CANDIDATE_SHEET) throw new Error('Candidates 탭에서 지원자 행을 선택하세요.');
  var range = sheet.getActiveRange();
  if (!range || range.getRow() < 2) throw new Error('헤더가 아닌 지원자 행을 선택하세요.');
  var start = Math.max(2, range.getRow());
  var end = range.getLastRow();
  var rows = [];
  for (var row = start; row <= end; row += 1) {
    if (sheet.getRange(row, 1).getDisplayValue().trim()) rows.push(row);
  }
  if (rows.length === 0) throw new Error('선택 범위에 등록된 지원자가 없습니다.');
  return { sheet: sheet, rows: rows };
}

function findCandidateRowByEmail_(sheet, email) {
  if (sheet.getLastRow() < 2) return 0;
  var emails = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (var index = 0; index < emails.length; index += 1) {
    if (String(emails[index][0]).trim().toLowerCase() === email) return index + 2;
  }
  return 0;
}

function promptRequired_(ui, title, message) {
  var value = promptOptional_(ui, title, message);
  if (value === null) return null;
  if (!value.trim()) {
    ui.alert('필수 입력값입니다.');
    return null;
  }
  return value;
}

function promptOptional_(ui, title, message) {
  var response = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
  return response.getSelectedButton() === ui.Button.OK ? response.getResponseText().trim() : null;
}

function parseKoreanDate_(text) {
  if (!text) return null;
  var match = String(text).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0);
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3]) || date.getHours() !== Number(match[4]) ||
      date.getMinutes() !== Number(match[5])) return null;
  return date;
}

function normalizePhone_(value) {
  var digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
  if (digits.length === 10 && digits.indexOf('02') === 0) return digits.slice(0, 2) + '-' + digits.slice(2, 6) + '-' + digits.slice(6);
  if (digits.length === 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  return digits;
}

function withDocumentLock_(callback) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    callback();
  } finally {
    lock.releaseLock();
  }
}

function firstMismatch_(actual, expected) {
  for (var index = 0; index < expected.length; index += 1) {
    if (String(actual[index] || '').trim() !== String(expected[index] || '').trim()) return index;
  }
  return -1;
}

function columnLetter_(column) {
  var result = '';
  while (column > 0) {
    var remainder = (column - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    column = Math.floor((column - 1) / 26);
  }
  return result;
}

function textRule_(range, text, color) {
  return SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(text)
    .setBackground(color)
    .setRanges([range])
    .build();
}

function responseHeaders_(itemIds) {
  return CF.RESPONSE_BASE_HEADERS.concat(itemIds);
}

function numberedIds_(prefix, count) {
  var result = [];
  for (var number = 1; number <= count; number += 1) {
    result.push(prefix + String(number).padStart(2, '0'));
  }
  return result;
}

function idsFromSpecs_(specs) {
  return specs.reduce(function (all, spec) {
    return all.concat(numberedIds_(spec[0], spec[1]));
  }, []);
}

function v2PilotItemIds_() {
  return idsFromSpecs_([
    ['V2-PR-', 27], ['V2-IN-', 27], ['V2-CU-', 27], ['V2-CO-', 27], ['V2-CH-', 27],
    ['V2-OCB-', 8], ['V2-CWB-', 8], ['V2-INT-', 12], ['V2-SD-', 8], ['V2-IM-', 6],
    ['V2-SDE-', 6], ['V2-IMC-', 4], ['V2-CONS-', 5]
  ]);
}

function v2BankItemIds_() {
  return idsFromSpecs_([
    ['V2-PR-', 40], ['V2-IN-', 40], ['V2-CU-', 40], ['V2-CO-', 40], ['V2-CH-', 40],
    ['V2-OCB-', 12], ['V2-CWB-', 12], ['V2-INT-', 16], ['V2-SD-', 15], ['V2-IM-', 15],
    ['V2-SDE-', 15], ['V2-IMC-', 5], ['V2-CONS-', 10]
  ]);
}

function legacyItemIds_() {
  return ('I001,I002,I003,I004,I005,I006,I007,I008,I009,I010,I011,I012,I013,I014,I015,I016,I017_R,I018_R,I019_R,I020_R,I021_R,I022_R,I023_R,I024_R,I033,I034,I035,I036,I037,I038,I039,I040,I041,I042,I043,I044,I045,I046,I047,I048,I049_R,I050_R,I051_R,I052_R,I053_R,I054_R,I055_R,I056_R,I065,I066,I067,I068,I069,I070,I071,I072,I073,I074,I075,I076,I077,I078,I079,I080,I081_R,I082_R,I083_R,I084_R,I085_R,I086_R,I087_R,I088_R,I097,I098,I099,I100,I101,I102,I103,I104,I105,I106,I107,I108,I109,I110,I111,I112,I113_R,I114_R,I115_R,I116_R,I117,I118_R,I119_R,I120_R,I125_R,I129,I130,I131,I132,I133,I134,I135,I136,I137,I138,I139,I140,I141,I142,I143,I144,I145_R,I146_R,I147_R,I148_R,I149_R,I150_R,I151_R,I152_R,I161,I162,I163,I164,I165,I166,I167,I168,I169,I170,I171,I172,I173,I174,I175,I176,I177,I178,I179,I180,I181,I182,I183,I184,I185,I186,I187,I188,I189,I190,I191,I192,I193,I194,I195,I196,I197,I198,I199,I200,I201,I202,I203,I204,I205,I206,I207,I208,I209,I210,I211,I212,I213,I214,I215,I216,I217,I218,I219,I220,I221,I222,I223,I224,I225,I226,I227,I228,I229,I230,I231,I232,I233,I234,I235,I236,I237,I238,I239,I240,I241,I242,I243,I244,I245,I246,I247,I248,I249,I250,I251,I252,I253,I254,I255,I256,I257,I258,I259,I260,I261,I265,I266,I267,I268,I269,I270,I271,I272,I274,I275,I276,I280,I281,I282,I285,I286,I288,I289_R,I291,I293,I294,I296,I299,N001,N002,N003,N004,N005,N006,N007,N008,N009,N010,N011,N012,N013,N014,N015,N016,N017,N018,N019,N020,N021,N022,N023,N024,N025,N026,N027,N028,N029,N030,N031,N032,N033,N034,N035,N036,N037,N038,N039,N040,N041,N042,N043,N044,N045,N046,N047,N048,N049,N050,N051_R,N052_R,N053_R,N054_R,N055_R').split(',');
}
