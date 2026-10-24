const fs = require('fs');
const path = require('path');

const existingPath = path.resolve(__dirname, '../frontend/src/data/foodPresets.json');
const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
const existingIds = new Set(existing.map(x => x.id));
const existingNames = new Set(existing.map(x => x.name.toLowerCase()));

// New high-demand retail items for Russian households
const newItems = [
  // Яйца
  {
    id: "eggs-chicken-c0",
    name: "Яйца куриные С0",
    category: "Молочная продукция",
    synonyms: ["яйца", "яйцо", "куриные яйца", "отборные яйца", "яйца с0", "десяток яиц"],
    shelf_life_days: { fridge: 28, freezer: null, pantry: 14 },
    after_opening_hours: null,
    risk_level: "high",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "Хранить в фабричной картонной упаковке острым концом вниз.",
    default_unit: "pack",
    notify_before_days: 3
  },
  {
    id: "eggs-chicken-c1",
    name: "Яйца куриные С1",
    category: "Молочная продукция",
    synonyms: ["яйца с1", "яйцо куриное столовое", "яйца первая категория"],
    shelf_life_days: { fridge: 28, freezer: null, pantry: 14 },
    after_opening_hours: null,
    risk_level: "high",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "Хранить на полке холодильника, избегая дверцы.",
    default_unit: "pack",
    notify_before_days: 3
  },
  {
    id: "eggs-quail",
    name: "Яйца перепелиные",
    category: "Молочная продукция",
    synonyms: ["перепелиные яйца", "яйца перепелки"],
    shelf_life_days: { fridge: 45, freezer: null, pantry: 25 },
    after_opening_hours: null,
    risk_level: "medium",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "В прохладном месте при температуре +2...+8°C.",
    default_unit: "pack",
    notify_before_days: 4
  },

  // Хлеб и выпечка (в Бакалея и консервы)
  {
    id: "bread-baton-sliced",
    name: "Батон нарезной",
    category: "Бакалея и консервы",
    synonyms: ["батон", "белый хлеб", "нарезка", "булка", "батон нарезка"],
    shelf_life_days: { fridge: 7, freezer: 60, pantry: 3 },
    after_opening_hours: 48,
    risk_level: "low",
    sanpin_ref: "ГОСТ 27842-88",
    storage_tips: "Хранить в сухой хлебнице или пакете. В холодильнике черствеет медленнее.",
    default_unit: "pcs",
    notify_before_days: 1
  },
  {
    id: "bread-black-borodinsky",
    name: "Хлеб Бородинский / Ржаной",
    category: "Бакалея и консервы",
    synonyms: ["хлеб черный", "хлеб бородинский", "ржаной хлеб", "дарницкий"],
    shelf_life_days: { fridge: 8, freezer: 90, pantry: 4 },
    after_opening_hours: 72,
    risk_level: "low",
    sanpin_ref: "ГОСТ 2077-84",
    storage_tips: "В отдельном бумажном или перфорированном пакете.",
    default_unit: "pcs",
    notify_before_days: 1
  },
  {
    id: "bread-lavash-armenian",
    name: "Лаваш тонкий армянский",
    category: "Бакалея и консервы",
    synonyms: ["лаваш", "армянский лаваш", "тонкий лаваш", "лепешка"],
    shelf_life_days: { fridge: 7, freezer: 90, pantry: 3 },
    after_opening_hours: 24,
    risk_level: "low",
    sanpin_ref: "ТУ производителя",
    storage_tips: "Плотно заворачивать в пакет, быстро сохнет на воздухе.",
    default_unit: "pack",
    notify_before_days: 1
  },
  {
    id: "bread-toast-sliced",
    name: "Хлеб тостовый пшеничный",
    category: "Бакалея и консервы",
    synonyms: ["тостовый хлеб", "хлеб для тостов", "сэндвичный хлеб", "американский тост"],
    shelf_life_days: { fridge: 10, freezer: 90, pantry: 5 },
    after_opening_hours: 72,
    risk_level: "low",
    sanpin_ref: "ТУ производителя",
    storage_tips: "В плотно закрытом пакете с зажимом.",
    default_unit: "pack",
    notify_before_days: 1
  },
  {
    id: "bread-baguette",
    name: "Багет французский",
    category: "Бакалея и консервы",
    synonyms: ["багет", "французский багет", "хрустящий багет"],
    shelf_life_days: { fridge: 3, freezer: 30, pantry: 1 },
    after_opening_hours: 24,
    risk_level: "low",
    sanpin_ref: "ТУ производителя",
    storage_tips: "Употребить в день покупки или заморозить порционно.",
    default_unit: "pcs",
    notify_before_days: 1
  },
  {
    id: "crispbread-rye",
    name: "Хлебцы цельнозерновые",
    category: "Бакалея и консервы",
    synonyms: ["хлебцы", "вафельные хлебцы", "ржаные хлебцы", "криспы"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 180 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ Р 55335-2012",
    storage_tips: "В сухом месте вдали от источников влаги.",
    default_unit: "pack",
    notify_before_days: 7
  },

  // Мясная гастрономия
  {
    id: "ham-sliced",
    name: "Ветчина из индейки / свинины",
    category: "Мясо и птица",
    synonyms: ["ветчина", "ветчина нарезка", "куриная ветчина"],
    shelf_life_days: { fridge: 14, freezer: 60, pantry: null },
    after_opening_hours: 48,
    risk_level: "high",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "В зоне свежести (0...+4°C). После вскрытия завернуть в пергамент.",
    default_unit: "pack",
    notify_before_days: 2
  },
  {
    id: "servelat-smoked",
    name: "Колбаса полукопченая Сервелат",
    category: "Мясо и птица",
    synonyms: ["сервелат", "полукопченая колбаса", "салями"],
    shelf_life_days: { fridge: 30, freezer: 90, pantry: null },
    after_opening_hours: 120,
    risk_level: "medium",
    sanpin_ref: "ГОСТ 31785-2012",
    storage_tips: "Хранить при температуре 0...+6°C.",
    default_unit: "pcs",
    notify_before_days: 3
  },
  {
    id: "sausages-milk",
    name: "Сосиски Молочные / Сливочные",
    category: "Мясо и птица",
    synonyms: ["сосиски", "сосиски молочные", "сливочные сосиски", "детские сосиски"],
    shelf_life_days: { fridge: 15, freezer: 60, pantry: null },
    after_opening_hours: 48,
    risk_level: "high",
    sanpin_ref: "ГОСТ 23670-2019",
    storage_tips: "Не замораживать повторно.",
    default_unit: "pack",
    notify_before_days: 2
  },
  {
    id: "sardelki-meat",
    name: "Сардельки говяжьи / свиные",
    category: "Мясо и птица",
    synonyms: ["сардельки", "шпикачки", "сарделька"],
    shelf_life_days: { fridge: 12, freezer: 60, pantry: null },
    after_opening_hours: 48,
    risk_level: "high",
    sanpin_ref: "ГОСТ 23670-2019",
    storage_tips: "В зоне свежести.",
    default_unit: "pack",
    notify_before_days: 2
  },
  {
    id: "pate-liver-can",
    name: "Паштет печеночный",
    category: "Мясо и птица",
    synonyms: ["паштет", "печеночный паштет", "паштет с гусиной печенью"],
    shelf_life_days: { fridge: 14, freezer: null, pantry: 365 },
    after_opening_hours: 24,
    risk_level: "high",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "После вскрытия переложить из жестяной банки в стеклянную посуду.",
    default_unit: "pcs",
    notify_before_days: 2
  },
  {
    id: "meat-carbonade-baked",
    name: "Карбонад / Буженина запеченная",
    category: "Мясо и птица",
    synonyms: ["карбонад", "буженина", "балык", "мясной деликатес"],
    shelf_life_days: { fridge: 10, freezer: 45, pantry: null },
    after_opening_hours: 48,
    risk_level: "high",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "Заворачивать в фольгу или пергамент.",
    default_unit: "pack",
    notify_before_days: 2
  },
  {
    id: "turkey-ground-meat",
    name: "Фарш из индейки",
    category: "Мясо и птица",
    synonyms: ["фарш индейка", "фарш из индейки охлажденный"],
    shelf_life_days: { fridge: 3, freezer: 90, pantry: null },
    after_opening_hours: 24,
    risk_level: "extreme",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "Самая холодная зона. Приготовить в течение суток или заморозить.",
    default_unit: "pack",
    notify_before_days: 1
  },

  // Овощи и зелень
  {
    id: "vegetable-zucchini",
    name: "Кабачки свежие",
    category: "Овощи и зелень",
    synonyms: ["кабачок", "кабачки", "цукини"],
    shelf_life_days: { fridge: 14, freezer: 180, pantry: 7 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 31822-2012",
    storage_tips: "В отсеке для овощей. Не мыть перед закладкой на хранение.",
    default_unit: "kg",
    notify_before_days: 2
  },
  {
    id: "vegetable-eggplant",
    name: "Баклажаны свежие",
    category: "Овощи и зелень",
    synonyms: ["баклажан", "баклажаны", "синенькие"],
    shelf_life_days: { fridge: 10, freezer: 180, pantry: 5 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 31821-2012",
    storage_tips: "В бумажном пакете в овощном ящике.",
    default_unit: "kg",
    notify_before_days: 2
  },
  {
    id: "vegetable-bell-pepper",
    name: "Перец болгарский сладкий",
    category: "Овощи и зелень",
    synonyms: ["перец", "болгарский перец", "сладкий перец", "паприка свежая"],
    shelf_life_days: { fridge: 14, freezer: 180, pantry: 5 },
    after_opening_hours: 48,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34325-2017",
    storage_tips: "Хранить сухими в овощном контейнере.",
    default_unit: "kg",
    notify_before_days: 2
  },
  {
    id: "vegetable-beetroot",
    name: "Свекла столовая свежая",
    category: "Овощи и зелень",
    synonyms: ["свекла", "свёкла", "бурак"],
    shelf_life_days: { fridge: 30, freezer: 180, pantry: 14 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 32285-2013",
    storage_tips: "В прохладном темном месте или ящике для овощей.",
    default_unit: "kg",
    notify_before_days: 3
  },
  {
    id: "vegetable-cauliflower",
    name: "Капуста цветная свежая",
    category: "Овощи и зелень",
    synonyms: ["цветная капуста", "капуста цветная"],
    shelf_life_days: { fridge: 10, freezer: 180, pantry: 3 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34323-2017",
    storage_tips: "В перфорированном пакете соцветиями вверх.",
    default_unit: "pcs",
    notify_before_days: 2
  },
  {
    id: "vegetable-peking-cabbage",
    name: "Капуста пекинская",
    category: "Овощи и зелень",
    synonyms: ["пекинка", "пекинская капуста", "китайский салат"],
    shelf_life_days: { fridge: 14, freezer: null, pantry: 4 },
    after_opening_hours: 72,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34324-2017",
    storage_tips: "В пищевой пленке в овощном отделе.",
    default_unit: "pcs",
    notify_before_days: 2
  },
  {
    id: "vegetable-green-onion",
    name: "Лук зеленый перо",
    category: "Овощи и зелень",
    synonyms: ["зеленый лук", "лук перо", "зелень лука"],
    shelf_life_days: { fridge: 7, freezer: 90, pantry: 2 },
    after_opening_hours: null,
    risk_level: "medium",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "Завернуть в слегка влажное бумажное полотенце.",
    default_unit: "pack",
    notify_before_days: 2
  },
  {
    id: "vegetable-radish",
    name: "Редис свежий",
    category: "Овощи и зелень",
    synonyms: ["редис", "редиска"],
    shelf_life_days: { fridge: 10, freezer: null, pantry: 3 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34215-2017",
    storage_tips: "Срезать ботву перед хранением, чтобы не вытягивала влагу.",
    default_unit: "pack",
    notify_before_days: 2
  },
  {
    id: "vegetable-pumpkin",
    name: "Тыква свежая",
    category: "Овощи и зелень",
    synonyms: ["тыква", "кусочек тыквы", "мускатная тыква"],
    shelf_life_days: { fridge: 7, freezer: 180, pantry: 60 },
    after_opening_hours: 48,
    risk_level: "low",
    sanpin_ref: "ГОСТ 7975-2013",
    storage_tips: "Целую хранить при комнатной температуре, надрезанную — в пленке в холодильнике.",
    default_unit: "kg",
    notify_before_days: 3
  },
  {
    id: "vegetable-celery-stalks",
    name: "Сельдерей стеблевой",
    category: "Овощи и зелень",
    synonyms: ["сельдерей", "стебли сельдерея", "черешковый сельдерей"],
    shelf_life_days: { fridge: 14, freezer: 90, pantry: 3 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34217-2017",
    storage_tips: "Плотно завернуть в фольгу, сохраняет хруст до двух недель.",
    default_unit: "pack",
    notify_before_days: 2
  },
  {
    id: "mushrooms-oyster",
    name: "Грибы вешенки свежие",
    category: "Овощи и зелень",
    synonyms: ["вешенки", "грибы вешенка"],
    shelf_life_days: { fridge: 6, freezer: 180, pantry: 1 },
    after_opening_hours: null,
    risk_level: "medium",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "В бумажном пакете в овощном ящике.",
    default_unit: "pack",
    notify_before_days: 2
  },

  // Фрукты и ягоды
  {
    id: "fruit-mandarin",
    name: "Мандарины свежие",
    category: "Фрукты и ягоды",
    synonyms: ["мандарин", "мандарины", "клементины"],
    shelf_life_days: { fridge: 20, freezer: null, pantry: 7 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34307-2017",
    storage_tips: "В холодильнике без полиэтиленового пакета.",
    default_unit: "kg",
    notify_before_days: 3
  },
  {
    id: "fruit-grapefruit",
    name: "Грейпфрут",
    category: "Фрукты и ягоды",
    synonyms: ["грейпфрут", "красный грейпфрут"],
    shelf_life_days: { fridge: 25, freezer: null, pantry: 10 },
    after_opening_hours: 48,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34306-2017",
    storage_tips: "В отсеке для фруктов.",
    default_unit: "pcs",
    notify_before_days: 3
  },
  {
    id: "fruit-lime",
    name: "Лайм свежий",
    category: "Фрукты и ягоды",
    synonyms: ["лайм", "зеленый лимон"],
    shelf_life_days: { fridge: 25, freezer: null, pantry: 10 },
    after_opening_hours: 72,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34305-2017",
    storage_tips: "В холодильнике в контейнере.",
    default_unit: "pcs",
    notify_before_days: 3
  },
  {
    id: "fruit-pomegranate",
    name: "Гранат свежий",
    category: "Фрукты и ягоды",
    synonyms: ["гранат", "зерна граната"],
    shelf_life_days: { fridge: 30, freezer: 90, pantry: 14 },
    after_opening_hours: 72,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34216-2017",
    storage_tips: "Целый гранат хранится в прохладном месте до месяца.",
    default_unit: "pcs",
    notify_before_days: 3
  },
  {
    id: "fruit-melon",
    name: "Дыня",
    category: "Фрукты и ягоды",
    synonyms: ["дыня", "торпеда", "колхозница"],
    shelf_life_days: { fridge: 5, freezer: 90, pantry: 14 },
    after_opening_hours: 36,
    risk_level: "medium",
    sanpin_ref: "ГОСТ 7178-2015",
    storage_tips: "Надрезанную дыню обязательно закрывать пленкой в холодильнике.",
    default_unit: "pcs",
    notify_before_days: 2
  },
  {
    id: "fruit-pineapple",
    name: "Ананас свежий",
    category: "Фрукты и ягоды",
    synonyms: ["ананас", "свежий ананас"],
    shelf_life_days: { fridge: 7, freezer: 90, pantry: 5 },
    after_opening_hours: 48,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34214-2017",
    storage_tips: "Нарезанный ананас хранить в закрытом герметичном контейнере.",
    default_unit: "pcs",
    notify_before_days: 2
  },
  {
    id: "fruit-mango",
    name: "Манго спелое",
    category: "Фрукты и ягоды",
    synonyms: ["манго", "желтое манго"],
    shelf_life_days: { fridge: 7, freezer: 90, pantry: 4 },
    after_opening_hours: 48,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34218-2017",
    storage_tips: "Спелое манго хранить в холодильнике.",
    default_unit: "pcs",
    notify_before_days: 2
  },
  {
    id: "fruit-cherry",
    name: "Черешня / Вишня свежая",
    category: "Фрукты и ягоды",
    synonyms: ["черешня", "вишня", "ягода"],
    shelf_life_days: { fridge: 6, freezer: 180, pantry: 2 },
    after_opening_hours: null,
    risk_level: "medium",
    sanpin_ref: "ГОСТ 33882-2016",
    storage_tips: "Не мыть до момента употребления.",
    default_unit: "kg",
    notify_before_days: 2
  },
  {
    id: "fruit-plum",
    name: "Сливы свежие",
    category: "Фрукты и ягоды",
    synonyms: ["слива", "сливы", "чернослив свежий"],
    shelf_life_days: { fridge: 10, freezer: 180, pantry: 4 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34219-2017",
    storage_tips: "В овощном ящике холодильника.",
    default_unit: "kg",
    notify_before_days: 2
  },

  // Бакалея и крупы
  {
    id: "pasta-spaghetti",
    name: "Макароны / Спагетти (сухие)",
    category: "Бакалея и консервы",
    synonyms: ["макароны", "спагетти", "перья", "рожки", "паста"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 730 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 31743-2017",
    storage_tips: "В сухом темном месте в закрытой банке или пакете.",
    default_unit: "pack",
    notify_before_days: 7
  },
  {
    id: "groats-rice-basmati",
    name: "Рис Басмати / Жасмин / Круглозерный",
    category: "Бакалея и консервы",
    synonyms: ["рис", "басмати", "жасмин", "белый рис", "пропаренный рис"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 540 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 6292-93",
    storage_tips: "В сухом шкафу в герметичной банке от жучков.",
    default_unit: "kg",
    notify_before_days: 7
  },
  {
    id: "groats-buckwheat",
    name: "Крупа гречневая (ядрица)",
    category: "Бакалея и консервы",
    synonyms: ["гречка", "гречневая крупа", "ядрица"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 540 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 55290-2012",
    storage_tips: "В сухом темном шкафу.",
    default_unit: "kg",
    notify_before_days: 7
  },
  {
    id: "groats-millet-couscous",
    name: "Пшено / Булгур / Кускус",
    category: "Бакалея и консервы",
    synonyms: ["пшено", "булгур", "кускус", "крупа"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 365 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 572-2016",
    storage_tips: "В сухом прохладном месте.",
    default_unit: "kg",
    notify_before_days: 7
  },
  {
    id: "groats-lentils-peas",
    name: "Чечевица / Горох колотый",
    category: "Бакалея и консервы",
    synonyms: ["чечевица", "горох", "красная чечевица", "нут"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 540 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 7066-2019",
    storage_tips: "В плотно закрытой емкости.",
    default_unit: "pack",
    notify_before_days: 7
  },
  {
    id: "canned-beans-red-white",
    name: "Фасоль консервированная (в соку/томате)",
    category: "Бакалея и консервы",
    synonyms: ["фасоль", "красная фасоль", "белая фасоль", "фасоль в томате"],
    shelf_life_days: { fridge: 3, freezer: null, pantry: 730 },
    after_opening_hours: 48,
    risk_level: "low",
    sanpin_ref: "ГОСТ Р 54676-2011",
    storage_tips: "После вскрытия переложить в стекло или контейнер.",
    default_unit: "pcs",
    notify_before_days: 3
  },
  {
    id: "canned-olives",
    name: "Оливки / Маслины консервированные",
    category: "Бакалея и консервы",
    synonyms: ["оливки", "маслины", "оливки без косточки"],
    shelf_life_days: { fridge: 7, freezer: null, pantry: 730 },
    after_opening_hours: 120,
    risk_level: "low",
    sanpin_ref: "ГОСТ 34113-2017",
    storage_tips: "После вскрытия хранить в рассоле в холодильнике.",
    default_unit: "pcs",
    notify_before_days: 3
  },
  {
    id: "canned-sprats-oil",
    name: "Шпроты в масле (ж/б)",
    category: "Бакалея и консервы",
    synonyms: ["шпроты", "шпроты в масле", "рыбные консервы"],
    shelf_life_days: { fridge: 3, freezer: null, pantry: 730 },
    after_opening_hours: 24,
    risk_level: "high",
    sanpin_ref: "ГОСТ 280-2009",
    storage_tips: "После вскрытия сразу переложить из жести.",
    default_unit: "pcs",
    notify_before_days: 3
  },
  {
    id: "canned-corned-pork",
    name: "Свинина тушеная (тушенка ж/б)",
    category: "Бакалея и консервы",
    synonyms: ["тушенка", "тушенка свиная", "свинина тушеная"],
    shelf_life_days: { fridge: 3, freezer: null, pantry: 1095 },
    after_opening_hours: 24,
    risk_level: "medium",
    sanpin_ref: "ГОСТ 32125-2013",
    storage_tips: "После вскрытия переложить в контейнер.",
    default_unit: "pcs",
    notify_before_days: 3
  },

  // Кондитерка и сладости (в Бакалея и консервы)
  {
    id: "sweets-chocolate-bar",
    name: "Шоколад молочный / темный",
    category: "Бакалея и консервы",
    synonyms: ["шоколад", "шоколадка", "горький шоколад", "молочный шоколад", "плитка шоколада"],
    shelf_life_days: { fridge: 180, freezer: null, pantry: 365 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 31721-2012",
    storage_tips: "Хранить при температуре +15...+21°C вдали от прямых солнечных лучей.",
    default_unit: "pcs",
    notify_before_days: 5
  },
  {
    id: "sweets-cookies-oatmeal",
    name: "Печенье овсяное / песочное",
    category: "Бакалея и консервы",
    synonyms: ["печенье", "овсяное печенье", "песочное печенье", "курабье", "крекер"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 90 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 24901-2014",
    storage_tips: "В плотно закрытом пакете или жестяной банке.",
    default_unit: "pack",
    notify_before_days: 3
  },
  {
    id: "sweets-marshmallow-zephyr",
    name: "Зефир / Пастила",
    category: "Бакалея и консервы",
    synonyms: ["зефир", "пастила", "маршмеллоу"],
    shelf_life_days: { fridge: 45, freezer: null, pantry: 60 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 6441-2014",
    storage_tips: "В закрытой упаковке, быстро сохнет на воздухе.",
    default_unit: "pack",
    notify_before_days: 3
  },
  {
    id: "sweets-waffles",
    name: "Вафли с начинкой",
    category: "Бакалея и консервы",
    synonyms: ["вафли", "вафельные трубочки"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 90 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 14031-2014",
    storage_tips: "В сухом месте.",
    default_unit: "pack",
    notify_before_days: 3
  },
  {
    id: "sweets-honey-natural",
    name: "Мед натуральный цветочный",
    category: "Бакалея и консервы",
    synonyms: ["мед", "мёд", "цветочный мед", "гречишный мед", "липовый мед"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 730 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 19792-2017",
    storage_tips: "В темном месте при комнатной температуре. Не хранить в холодильнике (быстро кристаллизуется).",
    default_unit: "pcs",
    notify_before_days: 7
  },
  {
    id: "sweets-jam-berry",
    name: "Варенье / Джем ягодный",
    category: "Бакалея и консервы",
    synonyms: ["варенье", "джем", "повидло", "конфитюр", "малиновое варенье", "клубничный джем"],
    shelf_life_days: { fridge: 60, freezer: null, pantry: 365 },
    after_opening_hours: 720,
    risk_level: "low",
    sanpin_ref: "ГОСТ 31712-2012",
    storage_tips: "После вскрытия держать в холодильнике.",
    default_unit: "pcs",
    notify_before_days: 5
  },

  // Напитки (чай, кофе, какао)
  {
    id: "drinks-tea-black-bags",
    name: "Чай черный (в пакетиках / листовой)",
    category: "Напитки",
    synonyms: ["чай", "черный чай", "пакетированный чай", "листовой чай", "гринфилд", "майский"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 730 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 32573-2013",
    storage_tips: "В герметичной банке вдали от пахучих продуктов и специй.",
    default_unit: "pack",
    notify_before_days: 7
  },
  {
    id: "drinks-tea-green",
    name: "Чай зеленый",
    category: "Напитки",
    synonyms: ["зеленый чай", "чай зеленый листовой"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 540 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 32574-2013",
    storage_tips: "В темной непрозрачной банке.",
    default_unit: "pack",
    notify_before_days: 7
  },
  {
    id: "drinks-coffee-instant",
    name: "Кофе растворимый (сублимированный)",
    category: "Напитки",
    synonyms: ["кофе", "растворимый кофе", "нескафе", "якобс"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 730 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 32776-2014",
    storage_tips: "Плотно завинчивать крышку, беречь от влаги.",
    default_unit: "pcs",
    notify_before_days: 7
  },
  {
    id: "drinks-coffee-beans-ground",
    name: "Кофе зерновой / молотый",
    category: "Напитки",
    synonyms: ["кофе в зернах", "молотый кофе", "зерновой кофе", "эспрессо"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 365 },
    after_opening_hours: 720,
    risk_level: "low",
    sanpin_ref: "ГОСТ 32775-2014",
    storage_tips: "В пачке с дегазационным клапаном в сухом шкафу.",
    default_unit: "pack",
    notify_before_days: 7
  },
  {
    id: "drinks-cocoa-powder",
    name: "Какао-порошок",
    category: "Напитки",
    synonyms: ["какао", "золотой ярлык", "несквик", "шоколадный напиток"],
    shelf_life_days: { fridge: null, freezer: null, pantry: 365 },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 108-2014",
    storage_tips: "В сухом месте в закрытой банке.",
    default_unit: "pack",
    notify_before_days: 7
  },
  {
    id: "drinks-apple-juice",
    name: "Сок яблочный осветленный (Тетрапак)",
    category: "Напитки",
    synonyms: ["яблочный сок", "сок яблоко", "сок добрый", "сок j7"],
    shelf_life_days: { fridge: 4, freezer: null, pantry: 365 },
    after_opening_hours: 72,
    risk_level: "low",
    sanpin_ref: "ГОСТ 32101-2013",
    storage_tips: "После вскрытия держать в холодильнике не более 3-4 дней.",
    default_unit: "l",
    notify_before_days: 2
  },

  // Молочная продукция и сыры
  {
    id: "dairy-curd-dessert",
    name: "Творожная масса с изюмом / курагой",
    category: "Молочная продукция",
    synonyms: ["творожная масса", "творожок с изюмом", "сырковая масса"],
    shelf_life_days: { fridge: 10, freezer: 30, pantry: null },
    after_opening_hours: 24,
    risk_level: "high",
    sanpin_ref: "СанПиН 2.3.2.1324-03 п. 3.2",
    storage_tips: "Хранить строго в холодильнике при температуре +2...+4°C.",
    default_unit: "pack",
    notify_before_days: 2
  },
  {
    id: "dairy-cream-cheese",
    name: "Сыр творожный / Крем-чиз",
    category: "Сыры",
    synonyms: ["творожный сыр", "крем чиз", "альметте", "хохланд творожный"],
    shelf_life_days: { fridge: 60, freezer: null, pantry: null },
    after_opening_hours: 72,
    risk_level: "medium",
    sanpin_ref: "ТУ производителя",
    storage_tips: "После вскрытия хранить под крышкой не более 3 суток.",
    default_unit: "pack",
    notify_before_days: 3
  },
  {
    id: "dairy-ayran-tan",
    name: "Айран / Тан кисломолочный",
    category: "Молочная продукция",
    synonyms: ["айран", "тан", "кумыс"],
    shelf_life_days: { fridge: 30, freezer: null, pantry: null },
    after_opening_hours: 48,
    risk_level: "medium",
    sanpin_ref: "ГОСТ 32260-2013",
    storage_tips: "Встряхивать перед употреблением, хранить в холодильнике.",
    default_unit: "l",
    notify_before_days: 2
  },
  {
    id: "dairy-butter-traditional",
    name: "Масло сливочное Крестьянское 72.5%",
    category: "Молочная продукция",
    synonyms: ["сливочное масло", "масло 72.5", "крестьянское масло"],
    shelf_life_days: { fridge: 35, freezer: 120, pantry: null },
    after_opening_hours: null,
    risk_level: "medium",
    sanpin_ref: "ГОСТ 32261-2013",
    storage_tips: "В масленке с непрозрачной крышкой, масло быстро окисляется на свету.",
    default_unit: "pack",
    notify_before_days: 3
  },

  // Полуфабрикаты
  {
    id: "semi-vareniki-potato",
    name: "Вареники с картофелем и грибами замороженные",
    category: "Полуфабрикаты",
    synonyms: ["вареники", "вареники с картошкой", "вареники замороженные"],
    shelf_life_days: { fridge: null, freezer: 180, pantry: null },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 33394-2015",
    storage_tips: "В морозильной камере при температуре не выше -18°C.",
    default_unit: "pack",
    notify_before_days: 5
  },
  {
    id: "semi-khinkali-frozen",
    name: "Хинкали / Манты замороженные",
    category: "Полуфабрикаты",
    synonyms: ["хинкали", "манты", "позы"],
    shelf_life_days: { fridge: null, freezer: 120, pantry: null },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 33394-2015",
    storage_tips: "В морозилке. Не допускать повторного размораживания.",
    default_unit: "pack",
    notify_before_days: 5
  },
  {
    id: "semi-syirniki-frozen",
    name: "Сырники творожные замороженные",
    category: "Полуфабрикаты",
    synonyms: ["сырники", "творожные сырники"],
    shelf_life_days: { fridge: null, freezer: 90, pantry: null },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ТУ производителя",
    storage_tips: "При температуре -18°C.",
    default_unit: "pack",
    notify_before_days: 5
  },
  {
    id: "semi-berries-frozen",
    name: "Ягоды замороженные (клубника/вишня/черника)",
    category: "Полуфабрикаты",
    synonyms: ["замороженные ягоды", "клубника замороженная", "вишня замороженная", "брусника замороженная"],
    shelf_life_days: { fridge: null, freezer: 365, pantry: null },
    after_opening_hours: null,
    risk_level: "low",
    sanpin_ref: "ГОСТ 33823-2016",
    storage_tips: "Шоковая заморозка при -18°C.",
    default_unit: "pack",
    notify_before_days: 7
  },

  // Соусы и приправы
  {
    id: "sauce-bbq",
    name: "Соус Барбекю (BBQ)",
    category: "Соусы и приправы",
    synonyms: ["барбекю", "соус барбекю", "bbq соус"],
    shelf_life_days: { fridge: 90, freezer: null, pantry: 365 },
    after_opening_hours: 720,
    risk_level: "low",
    sanpin_ref: "ТУ производителя",
    storage_tips: "После вскрытия хранить в дверце холодильника.",
    default_unit: "pcs",
    notify_before_days: 5
  },
  {
    id: "sauce-cheese",
    name: "Соус Сырный",
    category: "Соусы и приправы",
    synonyms: ["сырный соус", "соус сыр", "астория сырный", "хайнц сырный"],
    shelf_life_days: { fridge: 60, freezer: null, pantry: 180 },
    after_opening_hours: 360,
    risk_level: "medium",
    sanpin_ref: "ТУ производителя",
    storage_tips: "После вскрытия держать в холодильнике.",
    default_unit: "pcs",
    notify_before_days: 3
  },
  {
    id: "sauce-teriyaki",
    name: "Соус Терияки",
    category: "Соусы и приправы",
    synonyms: ["терияки", "соус терияки", "сладкий соевый соус"],
    shelf_life_days: { fridge: 120, freezer: null, pantry: 365 },
    after_opening_hours: 720,
    risk_level: "low",
    sanpin_ref: "ТУ производителя",
    storage_tips: "В темном прохладном месте или холодильнике.",
    default_unit: "pcs",
    notify_before_days: 5
  },
  {
    id: "sauce-garlic",
    name: "Соус Чесночный",
    category: "Соусы и приправы",
    synonyms: ["чесночный соус", "соус с чесноком"],
    shelf_life_days: { fridge: 45, freezer: null, pantry: 180 },
    after_opening_hours: 360,
    risk_level: "medium",
    sanpin_ref: "ТУ производителя",
    storage_tips: "После вскрытия в холодильнике.",
    default_unit: "pcs",
    notify_before_days: 3
  }
];

// Deduplicate and merge
let addedCount = 0;
for (const item of newItems) {
  if (!existingIds.has(item.id) && !existingNames.has(item.name.toLowerCase())) {
    existing.push(item);
    existingIds.add(item.id);
    existingNames.add(item.name.toLowerCase());
    addedCount++;
  }
}

console.log(`Merged ${addedCount} new items. Total: ${existing.length}`);

// Write back to both locations
const frontendPath = path.resolve(__dirname, '../frontend/src/data/foodPresets.json');
const rootPath = path.resolve(__dirname, '../src/data/foodPresets.json');

fs.writeFileSync(frontendPath, JSON.stringify(existing, null, 2), 'utf8');
fs.writeFileSync(rootPath, JSON.stringify(existing, null, 2), 'utf8');
console.log('Successfully updated both foodPresets.json files!');
