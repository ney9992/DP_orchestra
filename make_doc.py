#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Генерирует Vault_PDM_Руководство.docx через raw OOXML (нет внешних зависимостей)."""

import zipfile, io, textwrap
from xml.sax.saxutils import escape as xe
from datetime import datetime

OUT = r'e:\Bratsy_DP\Vault_PDM_Руководство.docx'

# ── OOXML helpers ─────────────────────────────────────────────────

def t(text):
    """Безопасный текстовый run-элемент."""
    return f'<w:r><w:t xml:space="preserve">{xe(text)}</w:t></w:r>'

def tr(text, rpr=""):
    """Run с форматированием."""
    return f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{xe(text)}</w:t></w:r>'

def h1(text):
    return f'<w:p><w:pPr><w:pStyle w:val="H1"/></w:pPr>{t(text)}</w:p>'

def h2(text):
    return f'<w:p><w:pPr><w:pStyle w:val="H2"/></w:pPr>{t(text)}</w:p>'

def h3(text):
    return f'<w:p><w:pPr><w:pStyle w:val="H3"/></w:pPr>{t(text)}</w:p>'

def p(text, *, bold=False, color="", indent=0, space_before=0, space_after=120):
    ppr_parts = []
    if indent:
        ppr_parts.append(f'<w:ind w:left="{indent}"/>')
    if space_before or space_after != 120:
        ppr_parts.append(f'<w:spacing w:before="{space_before}" w:after="{space_after}"/>')
    ppr = f'<w:pPr>{"".join(ppr_parts)}</w:pPr>' if ppr_parts else ''
    rpr = ''
    if bold:
        rpr += '<w:b/>'
    if color:
        rpr += f'<w:color w:val="{color}"/>'
    run = tr(text, rpr) if rpr else t(text)
    return f'<w:p>{ppr}{run}</w:p>'

def empty():
    return '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>'

def bullet(text, level=0):
    indent = 360 + level * 360
    hang   = 360
    prefix = "•  " if level == 0 else "◦  "
    ppr = (f'<w:pPr>'
           f'<w:ind w:left="{indent + hang}" w:hanging="{hang}"/>'
           f'<w:spacing w:after="60"/>'
           f'</w:pPr>')
    return f'<w:p>{ppr}{t(prefix + text)}</w:p>'

def code(lines):
    """Блок кода: Consolas 9pt, серый фон."""
    if isinstance(lines, str):
        lines = lines.splitlines()
    result = []
    for line in lines:
        ppr = ('<w:pPr>'
               '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>'
               '<w:ind w:left="360" w:right="360"/>'
               '<w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>'
               '</w:pPr>')
        rpr = ('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>'
               '<w:sz w:val="18"/><w:szCs w:val="18"/>')
        if not line:
            line = " "
        result.append(f'<w:p>{ppr}{tr(line, rpr)}</w:p>')
    return ''.join(result)

def note(label, text):
    """Выделенная заметка: жирный лейбл + текст."""
    ppr = '<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="EBF4FF"/><w:ind w:left="240" w:right="240"/></w:pPr>'
    lbl  = tr(label + "  ", '<w:b/><w:color w:val="1761A5"/>')
    body = t(text)
    return f'<w:p>{ppr}{lbl}{body}</w:p>'

def tbl(headers, rows, col_widths=None):
    """Таблица с заголовком."""
    def cell(text, header=False, shade=None, width=None):
        tcpr_parts = []
        if width:
            tcpr_parts.append(f'<w:tcW w:w="{width}" w:type="dxa"/>')
        fill = shade or ("D5E8D4" if header else "FFFFFF")
        tcpr_parts.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>')
        tcpr = f'<w:tcPr>{"".join(tcpr_parts)}</w:tcPr>'
        rpr  = '<w:b/><w:sz w:val="20"/><w:szCs w:val="20"/>' if header else '<w:sz w:val="20"/><w:szCs w:val="20"/>'
        ppr  = '<w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>'
        return f'<w:tc>{tcpr}<w:p>{ppr}{tr(text, rpr)}</w:p></w:tc>'

    borders = ('<w:tblBorders>'
               '<w:top    w:val="single" w:sz="4" w:space="0" w:color="BBBFC4"/>'
               '<w:left   w:val="single" w:sz="4" w:space="0" w:color="BBBFC4"/>'
               '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="BBBFC4"/>'
               '<w:right  w:val="single" w:sz="4" w:space="0" w:color="BBBFC4"/>'
               '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="BBBFC4"/>'
               '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="BBBFC4"/>'
               '</w:tblBorders>')
    tbl_pr = f'<w:tblPr><w:tblW w:w="0" w:type="auto"/>{borders}</w:tblPr>'

    def row(cells_data, header=False, shade=None):
        cells_xml = ''
        for i, txt in enumerate(cells_data):
            w = col_widths[i] if col_widths and i < len(col_widths) else None
            cells_xml += cell(txt, header=header, shade=shade, width=w)
        return f'<w:tr>{cells_xml}</w:tr>'

    tr_rows = row(headers, header=True)
    for i, r in enumerate(rows):
        bg = "F5F7FA" if i % 2 == 1 else None
        tr_rows += row(r, shade=bg)

    return f'<w:tbl>{tbl_pr}{tr_rows}</w:tbl>'

# ── Стили ────────────────────────────────────────────────────────

STYLES_XML = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
      <w:lang w:val="ru-RU"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr>
      <w:spacing w:after="160" w:line="259" w:lineRule="auto"/>
    </w:pPr></w:pPrDefault>
  </w:docDefaults>

  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120"/></w:pPr>
    <w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="H1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="400" w:after="160"/>
      <w:jc w:val="left"/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:color w:val="1F3864"/>
      <w:sz w:val="40"/><w:szCs w:val="40"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="H2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="320" w:after="120"/>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="6" w:space="4" w:color="1761A5"/>
      </w:pBdr>
    </w:pPr>
    <w:rPr>
      <w:b/><w:color w:val="1761A5"/>
      <w:sz w:val="28"/><w:szCs w:val="28"/>
    </w:rPr>
  </w:style>

  <w:style w:type="paragraph" w:styleId="H3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="200" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:color w:val="2E75B6"/>
      <w:sz w:val="24"/><w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>'''

# ── Вспомогательные XML-файлы ────────────────────────────────────

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>'''

RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>'''

DOC_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    Target="styles.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings"
    Target="settings.xml"/>
</Relationships>'''

SETTINGS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
</w:settings>'''

# ── Содержимое документа ─────────────────────────────────────────

now = datetime.now().strftime('%d.%m.%Y')

body = []
add = body.append

# Заголовок
add(h1('Руководство пользователя: блок «Vault PDM» в Bratsy DP'))
add(p(f'Приложение №2 к Договору №100225/ИТ · Версия 1.0 · {now}',
      color='5A5A5A', space_after=60))
add(empty())

# ── 1 ────────────────────────────────────────────────────────────
add(h2('1. Что это и зачем'))
add(p('Блок Vault PDM позволяет загрузить из системы хранения конструкторских данных '
      '(Autodesk Vault) актуальный состав изделия (BOM — Bill of Materials) '
      'непосредственно в приложение. Одним нажатием кнопки вы видите, какие детали '
      'и модули входят в изделие, в каком статусе согласования они находятся, '
      'и можете скачать связанные файлы (PDF-чертежи, DXF-раскрои).'))
add(note('Практический смысл:',
         'не нужно открывать Vault вручную, искать изделие, экспортировать '
         'состав — нажал кнопку и получил структуру и файлы прямо в пайплайне.'))
add(empty())

# ── 2 ────────────────────────────────────────────────────────────
add(h2('2. Что нужно перед началом работы'))

add(h3('2.1 Со стороны IT / администратора Vault'))
add(p('Для работы интеграции на сервере Vault должен быть развёрнут HTTP API — '
      'веб-сервис, описанный в Технических требованиях к PDM (раздел 3.2 Приложения №2). '
      'Это отдельный компонент: без него приложение работает только в тестовом режиме (mock).'))
add(p('Проверочный список для администратора:', bold=True))
add(tbl(
    ['Условие', 'Как проверить'],
    [
        ['API-сервис запущен',
         'В браузере открывается http://[сервер]:[порт]/api/v1/item?partNumber=тест — нет ошибки подключения'],
        ['Bearer-токен выдан',
         'Есть строка токена для авторизации (выдаёт администратор Vault)'],
        ['Изделие существует в Vault',
         'Например МЧД-001 — элемент (Item) существует в системе'],
        ['PDF и DXF прикреплены к позициям',
         'Файлы присоединены как FileAttachment к элементам состава изделия'],
        ['Стадия жизненного цикла актуальна',
         'Документы со статусом «Утверждено» готовы к производству'],
    ],
    col_widths=[3200, 6200],
))
add(empty())

add(h3('2.2 Со стороны пользователя приложения'))
add(p('Для настройки нужно знать три вещи:'))
add(bullet('Адрес сервера — например http://192.168.1.100:8080'))
add(bullet('Токен — строка для входа, выдаётся IT-администратором'))
add(bullet('Обозначение изделия — конструкторский номер, например МЧД-001'))
add(empty())

# ── 3 ────────────────────────────────────────────────────────────
add(h2('3. Настройка в приложении'))
add(p('Нажмите кнопку ⚙ (шестерёнка) в правом верхнем углу приложения. '
      'Прокрутите панель настроек вниз до раздела VAULT PDM API.'))
add(empty())

add(h3('3.1 URL сервера Vault'))
add(p('Адрес сервера с API. Указывается вместе с портом, включая протокол:'))
add(code(['http://192.168.1.100:8080']))
add(bullet('Обязательно указывать http:// или https://'))
add(bullet('Без слеша в конце адреса'))
add(bullet('Если оставить пустым — приложение работает в тестовом режиме (mock) без подключения к серверу'))
add(empty())

add(h3('3.2 Bearer-токен'))
add(p('Ключ доступа к API Vault. Хранится на вашем компьютере в файле '
      'settings.json рядом с .exe. Поле скрыто символами ●●● при вводе — это нормально. '
      'При смене токена просто введите новый и нажмите «Сохранить».'))
add(empty())

add(h3('3.3 Обозначение изделия по умолчанию'))
add(p('Конструкторский номер изделия, которое чаще всего нужно загружать:'))
add(bullet('Если заполнено — используется автоматически при каждом нажатии кнопки Vault PDM'))
add(bullet('Если пустое — приложение будет спрашивать через диалоговое окно каждый раз'))
add(empty())
add(p('После заполнения нажмите кнопку Сохранить в нижней части панели настроек.'))
add(empty())

# ── 4 ────────────────────────────────────────────────────────────
add(h2('4. Работа с блоком: пошаговая инструкция'))

add(h3('Шаг 1. Нажать на карточку «Vault PDM»'))
add(p('В списке этапов пайплайна найдите карточку Vault PDM и кликните на неё. '
      'Карточка подсветится синей рамкой — запрос отправляется на сервер.'))
add(empty())

add(h3('Шаг 2. Ввести обозначение (если не задано в настройках)'))
add(p('Если поле «Обозначение изделия» в настройках пустое, появится диалог с предложением '
      'ввести номер вручную. Нажмите Отмена — и запрос не будет выполнен.'))
add(empty())

add(h3('Шаг 3. Дождаться загрузки'))
add(p('В нижней части экрана открывается лог-панель с ходом запроса:'))
add(code([
    '14:23:01  Запрос BOM: МЧД-001',
    '14:23:01  GET http://192.168.1.100:8080/api/v1/bom',
    '14:23:02  Получено 7 элементов',
]))
add(p('Статус карточки переключается: Ready → Запущен → Завершён.'))
add(empty())

add(h3('Шаг 4. Работа с панелью «Состав изделия»'))
add(p('После загрузки под карточками этапов раскрывается панель СОСТАВ ИЗДЕЛИЯ '
      'с деревом всех позиций изделия:'))
add(code([
    '▼ МЧД-001         Дом жилой модульный                Утверждено   PDF',
    '  ▼ МЧД-001-01    Модуль 1 (жилая зона)    1 шт      Утверждено   PDF',
    '      МЧД-001-01-001  Панель стеновая       4 шт      Утверждено   PDF DXF',
    '      МЧД-001-01-002  Профиль 80×40        12 м.п.    Утверждено   PDF',
    '  ▼ МЧД-001-02    Модуль 2 (санузел)       1 шт      Утверждено   PDF',
    '      МЧД-001-02-001  Перекрытие            2 шт      Утверждено   PDF DXF',
    '      МЧД-001-02-002  Крепёж (компл.)       1 компл.  Утверждено   PDF',
]))
add(p('Клик на строку со стрелкой ▶ — сворачивает или разворачивает подуровень дерева.'))
add(p('Кнопка PDF или DXF в строке позиции — скачивает файл и сохраняет в:'))
add(code(['[Рабочий каталог]\\vault\\МЧД-001-01-001.pdf']))
add(p('В правом нижнем углу экрана появляется уведомление об успехе или ошибке. '
      'Закрыть панель BOM: кнопка ✕ в её правом верхнем углу.'))
add(empty())

# ── 5 ────────────────────────────────────────────────────────────
add(h2('5. Тестовый режим (mock) — без реального Vault'))
add(p('Если поле URL сервера пустое, приложение работает в режиме демонстрации. '
      'В лог-панели появится сообщение:'))
add(code(['[mock] Vault URL не задан — загружаю тестовые данные']))
add(p('Будет показан заранее заготовленный состав из 7 позиций в двухмодульной структуре. '
      'Кнопки PDF/DXF в этом режиме создают файл-заглушку в папке vault/. '
      'Это удобно для знакомства с интерфейсом до того, как API настроен.'))
add(empty())

# ── 6 ────────────────────────────────────────────────────────────
add(h2('6. Как приложение обращается к API'))

add(h3('6.1 Запрос состава изделия'))
add(p('При нажатии кнопки Vault PDM приложение отправляет HTTP GET-запрос:'))
add(code([
    'GET http://[сервер]:[порт]/api/v1/bom?partNumber=МЧД-001',
    'Authorization: Bearer [токен]',
]))
add(p('Сервер возвращает плоский список всех позиций изделия в формате JSON. '
      'Каждая позиция содержит:'))
add(tbl(
    ['Поле JSON', 'Что означает'],
    [
        ['PartNumber', 'Конструкторское обозначение позиции (МЧД-001-01-001)'],
        ['Title', 'Наименование детали или сборки'],
        ['ParentId', 'ID родительской позиции — по нему строится дерево'],
        ['Quant, Units', 'Количество и единица измерения'],
        ['LfCycStateId', 'Стадия жизненного цикла (5 = Утверждено)'],
        ['Files[]', 'Список прикреплённых файлов с их ID для скачивания'],
    ],
    col_widths=[2200, 7200],
))
add(empty())

add(h3('6.2 Скачивание файла'))
add(p('При нажатии кнопки PDF или DXF в строке позиции:'))
add(code([
    'GET http://[сервер]:[порт]/api/v1/file?id=2003',
    'Authorization: Bearer [токен]',
]))
add(p('Сервер возвращает бинарное содержимое файла. '
      'Приложение сохраняет его на диск в папку:'))
add(code(['[Рабочий каталог]\\vault\\[ИмяФайла]']))
add(empty())

add(h3('6.3 Стадии жизненного цикла документа'))
add(p('Цвет тега «Стадия» в таблице BOM отражает текущий статус в Vault:'))
add(tbl(
    ['Отображение', 'Значение', 'Цвет'],
    [
        ['Утверждено', 'Документ прошёл все согласования — готов к производству', 'Зелёный'],
        ['Пров. КО / Пров. качества / …', 'Документ на стадии согласования', 'Серый'],
        ['Доработка', 'Конструктор вносит правки по замечаниям', 'Серый'],
        ['Архив', 'Документ устарел, в производство не идёт', 'Серый'],
    ],
    col_widths=[2800, 4800, 1800],
))
add(note('Важно:', 'на производство должны идти только позиции со статусом «Утверждено».'))
add(empty())

add(h3('6.4 Связь с процессом согласования в Vault'))
add(p('Путь документа от разработки до появления в приложении:'))
add(code([
    'Конструктор создаёт 3D-модель / РКД в Autodesk Inventor',
    '        ↓',
    'Отправляет на согласование (Проверка КО → Проверка качества → …)',
    '        ↓',
    'Руководитель КО утверждает (статус: Утверждено)',
    '        ↓',
    'Vault автоматически формирует PDF и DXF (через Job Processor)',
    '        ↓',
    'API возвращает LfCycStateId = 5  ←  приложение показывает зелёный «Утверждено»',
]))
add(empty())

# ── 7 ────────────────────────────────────────────────────────────
add(h2('7. Возможные проблемы и решения'))
add(tbl(
    ['Проблема', 'Причина', 'Решение'],
    [
        ['Карточка Vault PDM показывает «Ошибка»',
         'Нет сетевого подключения к серверу',
         'Проверить URL в настройках; убедиться что сервер доступен (открыть URL в браузере)'],
        ['Ошибка «Vault API 401»',
         'Токен неверный или истёк',
         'Запросить новый токен у IT-администратора'],
        ['Ошибка «Vault API 404»',
         'Изделие с таким обозначением не найдено в Vault',
         'Уточнить точное написание обозначения в Vault'],
        ['Ошибка при скачивании файла',
         'Рабочий каталог не задан в настройках',
         'Настройки ⚙ → «Рабочий каталог» → выбрать папку → Сохранить'],
        ['Панель BOM пустая (0 позиций)',
         'В Vault нет дочерних элементов у этого изделия',
         'Уточнить у конструктора — BOM может ещё не быть заполнен в Vault'],
        ['Файл скачался, но пустой',
         'Приложение работает в mock-режиме',
         'Указать реальный URL сервера в настройках и сохранить'],
    ],
    col_widths=[2500, 3000, 4000],
))
add(empty())

# ── 8 ────────────────────────────────────────────────────────────
add(h2('8. Быстрая памятка'))
add(code([
    '1. Нажать ⚙ (шестерёнка) → прокрутить до раздела VAULT PDM API',
    '   • URL:         http://192.168.1.100:8080',
    '   • Токен:       получить у IT-администратора',
    '   • Обозначение: МЧД-001  (или оставить пустым — будет спрашивать)',
    '   → Нажать «Сохранить»',
    '',
    '2. Кликнуть карточку «Vault PDM» в пайплайне',
    '',
    '3. В панели BOM:',
    '   • Клик на строку ▶  →  свернуть / развернуть ветку',
    '   • Кнопка PDF / DXF  →  файл сохраняется в [рабочий каталог]\\vault\\',
    '   • Кнопка ✕          →  закрыть панель',
    '',
    '4. Если URL пустой — работает тестовый mock без подключения к серверу',
]))
add(empty())

# ── Сборка DOCX ──────────────────────────────────────────────────

body_xml = '\n'.join(body)
doc_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
{body_xml}
<w:sectPr>
  <w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>
  <w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"
           w:header="709" w:footer="709" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>'''

buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml',      CONTENT_TYPES)
    z.writestr('_rels/.rels',              RELS)
    z.writestr('word/document.xml',        doc_xml)
    z.writestr('word/_rels/document.xml.rels', DOC_RELS)
    z.writestr('word/styles.xml',          STYLES_XML)
    z.writestr('word/settings.xml',        SETTINGS)

with open(OUT, 'wb') as f:
    f.write(buf.getvalue())

print(f'Готово: {OUT}')
