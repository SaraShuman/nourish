import type { CatalogItem } from './types'

/**
 * Grocery recognition catalog (~80 common items).
 *
 * Extensible: append new CatalogItem entries. Keep this free of prices and
 * retailer names — those belong to the retailer/pricing module.
 *
 * Brands are product brands (e.g. "Dole", "Perdue"), never store names.
 */
export const GROCERY_CATALOG: CatalogItem[] = [
  // ── Produce ───────────────────────────────────────────────
  { id: 'bananas', canonicalName: 'Bananas', category: 'produce', aliases: ['banana', 'nanas'], defaultUnit: 'lb', units: ['lb', 'bunch', 'each'], brands: ['Dole', 'Chiquita', 'Del Monte'], emoji: '🍌' },
  { id: 'apples', canonicalName: 'Apples', category: 'produce', aliases: ['apple', 'gala', 'fuji', 'honeycrisp'], defaultUnit: 'lb', units: ['lb', 'each', 'bag'], brands: ['Gala', 'Fuji', 'Honeycrisp', 'Granny Smith'], emoji: '🍎' },
  { id: 'oranges', canonicalName: 'Oranges', category: 'produce', aliases: ['orange', 'navel orange'], defaultUnit: 'lb', units: ['lb', 'each', 'bag'], brands: ['Sunkist', 'Cuties', 'Halos'], emoji: '🍊' },
  { id: 'spinach', canonicalName: 'Spinach', category: 'produce', aliases: ['baby spinach', 'spinich'], defaultUnit: 'bunch', units: ['bunch', 'bag', 'oz'], brands: ['Earthbound Farm', 'Fresh Express'], emoji: '🥬' },
  { id: 'lettuce', canonicalName: 'Lettuce', category: 'produce', aliases: ['romaine', 'iceberg', 'leaf lettuce'], defaultUnit: 'head', units: ['head', 'bag', 'each'], brands: ['Fresh Express', 'Taylor Farms'], emoji: '🥬' },
  { id: 'tomatoes', canonicalName: 'Tomatoes', category: 'produce', aliases: ['tomato', 'roma tomato', 'cherry tomatoes'], defaultUnit: 'lb', units: ['lb', 'each', 'pint'], brands: ['Roma', 'Cherry', 'Vine-ripened'], emoji: '🍅' },
  { id: 'avocados', canonicalName: 'Avocados', category: 'produce', aliases: ['avocado', 'hass avocado'], defaultUnit: 'each', units: ['each', 'bag'], brands: ['Hass'], emoji: '🥑' },
  { id: 'potatoes', canonicalName: 'Potatoes', category: 'produce', aliases: ['potato', 'russet', 'yukon'], defaultUnit: 'lb', units: ['lb', 'bag', 'each'], brands: ['Russet', 'Yukon Gold', 'Idaho'], emoji: '🥔' },
  { id: 'onions', canonicalName: 'Onions', category: 'produce', aliases: ['onion', 'yellow onion', 'red onion'], defaultUnit: 'lb', units: ['lb', 'each', 'bag'], brands: [], emoji: '🧅' },
  { id: 'garlic', canonicalName: 'Garlic', category: 'produce', aliases: ['garlic clove', 'garlic bulb'], defaultUnit: 'each', units: ['each', 'bulb'], brands: [], emoji: '🧄' },
  { id: 'carrots', canonicalName: 'Carrots', category: 'produce', aliases: ['carrot', 'baby carrots'], defaultUnit: 'lb', units: ['lb', 'bag', 'bunch'], brands: ['Bolthouse Farms', 'Grimmway'], emoji: '🥕' },
  { id: 'broccoli', canonicalName: 'Broccoli', category: 'produce', aliases: ['broccolli'], defaultUnit: 'head', units: ['head', 'lb', 'bunch'], brands: [], emoji: '🥦' },
  { id: 'bell-peppers', canonicalName: 'Bell Peppers', category: 'produce', aliases: ['bell pepper', 'pepper', 'red pepper', 'green pepper'], defaultUnit: 'each', units: ['each', 'lb', 'bag'], brands: [], emoji: '🫑' },
  { id: 'cucumbers', canonicalName: 'Cucumbers', category: 'produce', aliases: ['cucumber', 'cuke'], defaultUnit: 'each', units: ['each', 'lb'], brands: [], emoji: '🥒' },
  { id: 'strawberries', canonicalName: 'Strawberries', category: 'produce', aliases: ['strawberry'], defaultUnit: 'lb', units: ['lb', 'pint', 'container'], brands: ['Driscoll\'s'], emoji: '🍓' },
  { id: 'blueberries', canonicalName: 'Blueberries', category: 'produce', aliases: ['blueberry'], defaultUnit: 'pint', units: ['pint', 'container', 'oz'], brands: ['Driscoll\'s'], emoji: '🫐' },
  { id: 'grapes', canonicalName: 'Grapes', category: 'produce', aliases: ['grape', 'green grapes', 'red grapes'], defaultUnit: 'lb', units: ['lb', 'bag'], brands: [], emoji: '🍇' },
  { id: 'lemons', canonicalName: 'Lemons', category: 'produce', aliases: ['lemon'], defaultUnit: 'each', units: ['each', 'lb', 'bag'], brands: [], emoji: '🍋' },
  { id: 'mushrooms', canonicalName: 'Mushrooms', category: 'produce', aliases: ['mushroom', 'button mushrooms', 'cremini'], defaultUnit: 'oz', units: ['oz', 'lb', 'package'], brands: ['Monterey'], emoji: '🍄' },
  { id: 'celery', canonicalName: 'Celery', category: 'produce', aliases: ['celery stalk'], defaultUnit: 'bunch', units: ['bunch', 'each'], brands: [], emoji: '🥬' },

  // ── Dairy & Eggs ──────────────────────────────────────────
  { id: 'whole-milk', canonicalName: 'Whole Milk', category: 'dairy', aliases: ['milk', 'whole milk', 'vitamin d milk'], defaultUnit: 'gal', units: ['gal', 'half gal', 'qt'], brands: ['Horizon Organic', 'Fairlife', 'Organic Valley'], emoji: '🥛' },
  { id: 'skim-milk', canonicalName: 'Skim Milk', category: 'dairy', aliases: ['nonfat milk', 'fat free milk', 'skim'], defaultUnit: 'gal', units: ['gal', 'half gal', 'qt'], brands: ['Horizon Organic', 'Fairlife'], emoji: '🥛' },
  { id: 'almond-milk', canonicalName: 'Almond Milk', category: 'dairy', aliases: ['almondmilk'], defaultUnit: 'half gal', units: ['half gal', 'qt'], brands: ['Almond Breeze', 'Silk', 'Califia'], emoji: '🥛' },
  { id: 'eggs', canonicalName: 'Eggs', category: 'dairy', aliases: ['egg', 'large eggs', 'dozen eggs'], defaultUnit: 'dozen', units: ['dozen', 'half dozen', '18-pack'], brands: ['Eggland\'s Best', 'Vital Farms', 'Happy Egg'], emoji: '🥚' },
  { id: 'butter', canonicalName: 'Butter', category: 'dairy', aliases: ['unsalted butter', 'salted butter', 'stick butter'], defaultUnit: 'lb', units: ['lb', 'stick', 'oz'], brands: ['Land O\'Lakes', 'Kerrygold', 'Challenge'], emoji: '🧈' },
  { id: 'cheddar-cheese', canonicalName: 'Cheddar Cheese', category: 'dairy', aliases: ['cheddar', 'cheese', 'sharp cheddar'], defaultUnit: 'oz', units: ['oz', 'lb', 'block'], brands: ['Tillamook', 'Cabot', 'Kraft'], emoji: '🧀' },
  { id: 'greek-yogurt', canonicalName: 'Greek Yogurt', category: 'dairy', aliases: ['yogurt', 'greek yoghurt', 'yoghurt'], defaultUnit: '32 oz', units: ['32 oz', '5.3 oz', 'container'], brands: ['Chobani', 'Fage', 'Oikos'], emoji: '🥣' },
  { id: 'cream-cheese', canonicalName: 'Cream Cheese', category: 'dairy', aliases: ['creamcheese'], defaultUnit: 'oz', units: ['oz', 'block', 'tub'], brands: ['Philadelphia'], emoji: '🧀' },
  { id: 'sour-cream', canonicalName: 'Sour Cream', category: 'dairy', aliases: ['sourcream'], defaultUnit: 'oz', units: ['oz', 'container'], brands: ['Daisy', 'Breakstone\'s'], emoji: '🥣' },
  { id: 'orange-juice', canonicalName: 'Orange Juice', category: 'beverages', aliases: ['oj', 'orange juice'], defaultUnit: 'half gal', units: ['half gal', 'qt', '52 oz'], brands: ['Tropicana', 'Simply Orange', 'Minute Maid'], emoji: '🧃' },

  // ── Meat & Seafood ────────────────────────────────────────
  { id: 'chicken-breast', canonicalName: 'Chicken Breast', category: 'meat', aliases: ['chicken breast', 'chicken breasts', 'chicken'], defaultUnit: 'lb', units: ['lb', 'package'], brands: ['Perdue', 'Tyson', 'Foster Farms'], emoji: '🍗' },
  { id: 'chicken-thighs', canonicalName: 'Chicken Thighs', category: 'meat', aliases: ['chicken thigh', 'chicken thighs', 'boneless chicken thighs', 'bone-in chicken thighs'], defaultUnit: 'lb', units: ['lb', 'package'], brands: ['Perdue', 'Tyson', 'Foster Farms'], emoji: '🍗' },
  { id: 'chicken-legs', canonicalName: 'Chicken Legs', category: 'meat', aliases: ['chicken leg', 'chicken legs', 'chicken drumstick', 'chicken drumsticks', 'drumstick', 'drumsticks'], defaultUnit: 'lb', units: ['lb', 'package'], brands: ['Perdue', 'Tyson', 'Foster Farms'], emoji: '🍗' },
  { id: 'chicken-wings', canonicalName: 'Chicken Wings', category: 'meat', aliases: ['chicken wing', 'chicken wings', 'wings', 'buffalo wings'], defaultUnit: 'lb', units: ['lb', 'package'], brands: ['Perdue', 'Tyson', 'Foster Farms'], emoji: '🍗' },
  { id: 'whole-chicken', canonicalName: 'Whole Chicken', category: 'meat', aliases: ['whole chicken', 'roasting chicken', 'roaster chicken', 'fryer chicken'], defaultUnit: 'each', units: ['each', 'lb'], brands: ['Perdue', 'Tyson', 'Foster Farms'], emoji: '🍗' },
  { id: 'ground-chicken', canonicalName: 'Ground Chicken', category: 'meat', aliases: ['ground chicken', 'chicken mince'], defaultUnit: 'lb', units: ['lb', 'package'], brands: ['Perdue', 'Tyson', 'Foster Farms'], emoji: '🍗' },
  { id: 'ground-beef', canonicalName: 'Ground Beef', category: 'meat', aliases: ['beef', 'hamburger meat', 'ground chuck'], defaultUnit: 'lb', units: ['lb', 'package'], brands: ['Laura\'s Lean', '85/15', '93/7'], emoji: '🥩' },
  { id: 'bacon', canonicalName: 'Bacon', category: 'meat', aliases: ['bacon strips'], defaultUnit: 'lb', units: ['lb', 'package', 'oz'], brands: ['Oscar Mayer', 'Hormel', 'Applegate'], emoji: '🥓' },
  { id: 'ground-turkey', canonicalName: 'Ground Turkey', category: 'meat', aliases: ['turkey', 'ground turkey meat'], defaultUnit: 'lb', units: ['lb', 'package'], brands: ['Jennie-O', 'Butterball'], emoji: '🦃' },
  { id: 'pork-chops', canonicalName: 'Pork Chops', category: 'meat', aliases: ['pork chop', 'pork'], defaultUnit: 'lb', units: ['lb', 'package'], brands: ['Smithfield'], emoji: '🥩' },
  { id: 'sausage', canonicalName: 'Sausage', category: 'meat', aliases: ['sausages', 'italian sausage', 'breakfast sausage'], defaultUnit: 'lb', units: ['lb', 'package'], brands: ['Johnsonville', 'Jimmy Dean'], emoji: '🌭' },
  { id: 'salmon', canonicalName: 'Salmon', category: 'seafood', aliases: ['salmon fillet', 'salmon filet'], defaultUnit: 'lb', units: ['lb', 'fillet'], brands: ['Wild-caught', 'Atlantic'], emoji: '🐟' },
  { id: 'shrimp', canonicalName: 'Shrimp', category: 'seafood', aliases: ['prawns', 'frozen shrimp'], defaultUnit: 'lb', units: ['lb', 'bag'], brands: [], emoji: '🦐' },
  { id: 'tuna', canonicalName: 'Canned Tuna', category: 'pantry', aliases: ['tuna', 'tuna fish', 'canned tuna'], defaultUnit: 'can', units: ['can', 'oz', 'pack'], brands: ['StarKist', 'Bumble Bee', 'Chicken of the Sea'], emoji: '🐟' },

  // ── Bakery & Bread ────────────────────────────────────────
  { id: 'bread', canonicalName: 'Bread', category: 'bakery', aliases: ['white bread', 'wheat bread', 'loaf', 'sandwich bread'], defaultUnit: 'loaf', units: ['loaf', 'each'], brands: ['Dave\'s Killer Bread', 'Nature\'s Own', 'Sara Lee'], emoji: '🍞' },
  { id: 'bagels', canonicalName: 'Bagels', category: 'bakery', aliases: ['bagel'], defaultUnit: 'pack', units: ['pack', 'each', 'dozen'], brands: ['Thomas\'', 'Sara Lee'], emoji: '🥯' },
  { id: 'tortillas', canonicalName: 'Tortillas', category: 'bakery', aliases: ['tortilla', 'flour tortillas', 'corn tortillas'], defaultUnit: 'pack', units: ['pack', 'dozen'], brands: ['Mission', 'Guerrero'], emoji: '🫓' },
  { id: 'english-muffins', canonicalName: 'English Muffins', category: 'bakery', aliases: ['english muffin', 'muffins'], defaultUnit: 'pack', units: ['pack', 'each'], brands: ['Thomas\''], emoji: '🧁' },
  { id: 'croissants', canonicalName: 'Croissants', category: 'bakery', aliases: ['croissant'], defaultUnit: 'pack', units: ['pack', 'each'], brands: [], emoji: '🥐' },

  // ── Pantry & Dry Goods ────────────────────────────────────
  { id: 'pasta', canonicalName: 'Pasta', category: 'pantry', aliases: ['spaghetti', 'penne', 'noodles', 'macaroni', 'rigatoni', 'rotini', 'elbow macaroni'], defaultUnit: 'box', units: ['box', 'lb', 'bag'], brands: ['Barilla', 'De Cecco', 'Ronzoni'], emoji: '🍝' },
  { id: 'rice', canonicalName: 'Rice', category: 'pantry', aliases: ['white rice', 'brown rice', 'jasmine rice', 'basmati'], defaultUnit: 'lb', units: ['lb', 'bag', 'box'], brands: ['Mahatma', 'Uncle Ben\'s', 'Lundberg'], emoji: '🍚' },
  { id: 'cereal', canonicalName: 'Cereal', category: 'pantry', aliases: ['breakfast cereal'], defaultUnit: 'box', units: ['box', 'oz'], brands: ['Cheerios', 'Kellogg\'s', 'Post'], emoji: '🥣' },
  { id: 'oatmeal', canonicalName: 'Oatmeal', category: 'pantry', aliases: ['oats', 'rolled oats', 'instant oatmeal'], defaultUnit: 'container', units: ['container', 'box', 'lb'], brands: ['Quaker', 'Bob\'s Red Mill'], emoji: '🥣' },
  { id: 'flour', canonicalName: 'Flour', category: 'pantry', aliases: ['all purpose flour', 'all-purpose flour', 'ap flour'], defaultUnit: 'lb', units: ['lb', 'bag'], brands: ['King Arthur', 'Gold Medal', 'Pillsbury'], emoji: '🌾' },
  { id: 'sugar', canonicalName: 'Sugar', category: 'pantry', aliases: ['white sugar', 'granulated sugar'], defaultUnit: 'lb', units: ['lb', 'bag'], brands: ['Domino', 'C&H'], emoji: '🧂' },
  { id: 'salt', canonicalName: 'Salt', category: 'pantry', aliases: ['table salt', 'kosher salt', 'sea salt'], defaultUnit: 'container', units: ['container', 'oz'], brands: ['Morton', 'Diamond Crystal'], emoji: '🧂' },
  { id: 'olive-oil', canonicalName: 'Olive Oil', category: 'pantry', aliases: ['extra virgin olive oil', 'evoo'], defaultUnit: 'bottle', units: ['bottle', 'oz'], brands: ['Bertolli', 'California Olive Ranch', 'Pompeian'], emoji: '🫒' },
  { id: 'vegetable-oil', canonicalName: 'Vegetable Oil', category: 'pantry', aliases: ['canola oil', 'cooking oil'], defaultUnit: 'bottle', units: ['bottle', 'oz'], brands: ['Crisco', 'Wesson'], emoji: '🛢️' },
  { id: 'peanut-butter', canonicalName: 'Peanut Butter', category: 'pantry', aliases: ['pb', 'peanutbutter'], defaultUnit: 'jar', units: ['jar', 'oz'], brands: ['Jif', 'Skippy', 'Smucker\'s'], emoji: '🥜' },
  { id: 'jelly', canonicalName: 'Jelly', category: 'pantry', aliases: ['jam', 'grape jelly', 'strawberry jam', 'preserves'], defaultUnit: 'jar', units: ['jar', 'oz'], brands: ['Smucker\'s', 'Welch\'s'], emoji: '🍇' },
  { id: 'honey', canonicalName: 'Honey', category: 'pantry', aliases: ['raw honey'], defaultUnit: 'bottle', units: ['bottle', 'oz', 'jar'], brands: ['Nature Nate\'s', 'Local Hive'], emoji: '🍯' },
  { id: 'canned-beans', canonicalName: 'Canned Beans', category: 'pantry', aliases: ['beans', 'black beans', 'kidney beans', 'pinto beans'], defaultUnit: 'can', units: ['can', 'oz'], brands: ['Bush\'s', 'Goya'], emoji: '🥫' },
  { id: 'canned-tomatoes', canonicalName: 'Canned Tomatoes', category: 'pantry', aliases: ['diced tomatoes', 'crushed tomatoes', 'tomato sauce'], defaultUnit: 'can', units: ['can', 'oz'], brands: ['Hunt\'s', 'Muir Glen', 'San Marzano'], emoji: '🥫' },
  { id: 'pasta-sauce', canonicalName: 'Pasta Sauce', category: 'pantry', aliases: ['marinara', 'spaghetti sauce', 'tomato sauce'], defaultUnit: 'jar', units: ['jar', 'oz'], brands: ['Rao\'s', 'Prego', 'Classico'], emoji: '🫙' },
  { id: 'chicken-broth', canonicalName: 'Chicken Broth', category: 'pantry', aliases: ['chicken stock', 'broth', 'stock'], defaultUnit: 'carton', units: ['carton', 'can', 'oz'], brands: ['Swanson', 'Pacific Foods'], emoji: '🥣' },
  { id: 'coffee', canonicalName: 'Coffee', category: 'beverages', aliases: ['ground coffee', 'coffee beans'], defaultUnit: 'bag', units: ['bag', 'oz', 'can'], brands: ['Folgers', 'Starbucks', 'Peet\'s', 'Maxwell House'], emoji: '☕' },
  { id: 'tea', canonicalName: 'Tea', category: 'beverages', aliases: ['tea bags', 'green tea', 'black tea'], defaultUnit: 'box', units: ['box', 'count'], brands: ['Lipton', 'Bigelow', 'Celestial'], emoji: '🍵' },

  // ── Beverages ─────────────────────────────────────────────
  { id: 'water', canonicalName: 'Bottled Water', category: 'beverages', aliases: ['water', 'spring water'], defaultUnit: 'pack', units: ['pack', 'case', 'bottle'], brands: ['Dasani', 'Aquafina', 'Poland Spring'], emoji: '💧' },
  { id: 'soda', canonicalName: 'Soda', category: 'beverages', aliases: ['pop', 'cola', 'soft drink'], defaultUnit: 'pack', units: ['pack', 'case', 'bottle', '2-liter'], brands: ['Coca-Cola', 'Pepsi', 'Sprite'], emoji: '🥤' },

  // ── Frozen ────────────────────────────────────────────────
  { id: 'frozen-pizza', canonicalName: 'Frozen Pizza', category: 'frozen', aliases: ['pizza'], defaultUnit: 'each', units: ['each', 'pack'], brands: ['DiGiorno', 'Red Baron', 'Tombstone'], emoji: '🍕' },
  { id: 'ice-cream', canonicalName: 'Ice Cream', category: 'frozen', aliases: ['icecream'], defaultUnit: 'pint', units: ['pint', 'half gal', 'container'], brands: ['Ben & Jerry\'s', 'Häagen-Dazs', 'Breyers'], emoji: '🍨' },
  { id: 'frozen-vegetables', canonicalName: 'Frozen Vegetables', category: 'frozen', aliases: ['frozen veggies', 'frozen peas', 'frozen corn', 'frozen broccoli'], defaultUnit: 'bag', units: ['bag', 'oz'], brands: ['Birds Eye', 'Green Giant'], emoji: '🥦' },
  { id: 'frozen-berries', canonicalName: 'Frozen Berries', category: 'frozen', aliases: ['frozen fruit', 'frozen strawberries', 'frozen blueberries'], defaultUnit: 'bag', units: ['bag', 'oz'], brands: ['Dole'], emoji: '🫐' },
  { id: 'frozen-waffles', canonicalName: 'Frozen Waffles', category: 'frozen', aliases: ['waffles', 'eggo'], defaultUnit: 'box', units: ['box', 'pack'], brands: ['Eggo'], emoji: '🧇' },

  // ── Snacks ────────────────────────────────────────────────
  { id: 'chips', canonicalName: 'Potato Chips', category: 'snacks', aliases: ['chips', 'potato chips'], defaultUnit: 'bag', units: ['bag', 'oz'], brands: ['Lay\'s', 'Ruffles', 'Kettle'], emoji: '🍟' },
  { id: 'tortilla-chips', canonicalName: 'Tortilla Chips', category: 'snacks', aliases: ['corn chips', 'nachos'], defaultUnit: 'bag', units: ['bag', 'oz'], brands: ['Tostitos', 'Doritos'], emoji: '🌽' },
  { id: 'crackers', canonicalName: 'Crackers', category: 'snacks', aliases: ['cracker', 'saltines'], defaultUnit: 'box', units: ['box', 'oz'], brands: ['Ritz', 'Triscuit', 'Wheat Thins'], emoji: '🍘' },
  { id: 'cookies', canonicalName: 'Cookies', category: 'snacks', aliases: ['cookie'], defaultUnit: 'pack', units: ['pack', 'box'], brands: ['Oreo', 'Chips Ahoy', 'Pepperidge Farm'], emoji: '🍪' },
  { id: 'granola-bars', canonicalName: 'Granola Bars', category: 'snacks', aliases: ['granola bar', 'protein bars', 'cereal bars'], defaultUnit: 'box', units: ['box', 'pack'], brands: ['Nature Valley', 'KIND', 'Clif'], emoji: '🍫' },
  { id: 'popcorn', canonicalName: 'Popcorn', category: 'snacks', aliases: ['microwave popcorn'], defaultUnit: 'box', units: ['box', 'bag'], brands: ['Orville Redenbacher\'s', 'Skinny Pop'], emoji: '🍿' },
  { id: 'nuts', canonicalName: 'Mixed Nuts', category: 'snacks', aliases: ['almonds', 'cashews', 'peanuts', 'walnuts'], defaultUnit: 'bag', units: ['bag', 'oz', 'can'], brands: ['Planters', 'Blue Diamond'], emoji: '🥜' },

  // ── Condiments & Misc ─────────────────────────────────────
  { id: 'ketchup', canonicalName: 'Ketchup', category: 'pantry', aliases: ['catsup'], defaultUnit: 'bottle', units: ['bottle', 'oz'], brands: ['Heinz', 'Hunt\'s'], emoji: '🍅' },
  { id: 'mustard', canonicalName: 'Mustard', category: 'pantry', aliases: ['yellow mustard', 'dijon'], defaultUnit: 'bottle', units: ['bottle', 'oz'], brands: ['French\'s', 'Grey Poupon'], emoji: '🌭' },
  { id: 'mayonnaise', canonicalName: 'Mayonnaise', category: 'pantry', aliases: ['mayo'], defaultUnit: 'jar', units: ['jar', 'oz'], brands: ['Hellmann\'s', 'Duke\'s', 'Kraft'], emoji: '🥫' },
  { id: 'salsa', canonicalName: 'Salsa', category: 'pantry', aliases: ['pico de gallo'], defaultUnit: 'jar', units: ['jar', 'oz'], brands: ['Tostitos', 'Pace', 'Herdez'], emoji: '🌶️' },
  { id: 'soy-sauce', canonicalName: 'Soy Sauce', category: 'pantry', aliases: ['soysauce'], defaultUnit: 'bottle', units: ['bottle', 'oz'], brands: ['Kikkoman', 'La Choy'], emoji: '🍶' },
  { id: 'maple-syrup', canonicalName: 'Maple Syrup', category: 'pantry', aliases: ['syrup', 'pancake syrup'], defaultUnit: 'bottle', units: ['bottle', 'oz'], brands: ['Aunt Jemima', 'Log Cabin', 'Grade A'], emoji: '🍁' },
  { id: 'paper-towels', canonicalName: 'Paper Towels', category: 'other', aliases: ['paper towel'], defaultUnit: 'pack', units: ['pack', 'roll'], brands: ['Bounty', 'Brawny', 'Viva'], emoji: '🧻' },
  { id: 'toilet-paper', canonicalName: 'Toilet Paper', category: 'other', aliases: ['tp', 'bathroom tissue'], defaultUnit: 'pack', units: ['pack', 'roll'], brands: ['Charmin', 'Cottonelle', 'Scott'], emoji: '🧻' },
  { id: 'dish-soap', canonicalName: 'Dish Soap', category: 'other', aliases: ['dishwashing liquid', 'dish detergent'], defaultUnit: 'bottle', units: ['bottle', 'oz'], brands: ['Dawn', 'Palmolive'], emoji: '🧴' },
  { id: 'laundry-detergent', canonicalName: 'Laundry Detergent', category: 'other', aliases: ['detergent', 'laundry soap'], defaultUnit: 'bottle', units: ['bottle', 'oz', 'pack'], brands: ['Tide', 'Gain', 'Arm & Hammer'], emoji: '🧴' },
]

/** Fast lookup by catalog id. */
export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(
  GROCERY_CATALOG.map((item) => [item.id, item])
)
