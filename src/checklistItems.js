// The other half of Tyler's full dorm-shopping list: small/consumable items that don't make
// sense as 3D objects in the room (pens, detergent, sticky notes, individual dishware, etc).
// The 3D-placeable half lives in catalog.js's CATALOG. Seeds a new user's packing-checklist tab
// (see storage.js's listChecklistItems). `checked` and `is_custom` are runtime fields the DB
// adds, not part of this static seed list.
//
// A few items (e.g. "Laundry bag") appear under more than one category/subcategory because
// they did in Tyler's original list — that's fine for a checklist, each row is just a checkbox.

// Full display order for the checklist tab — all 11 of Tyler's categories, including School
// Supplies and Bathroom, which have zero placeable items (so they never appear in catalog.js's
// CATEGORY_ORDER) but plenty of checklist-only ones. Icons are shared with catalog.js's
// CATEGORY_ICONS rather than duplicated here.
export const CHECKLIST_CATEGORY_ORDER = [
  'Bedding',
  'Furniture & Organization',
  'School Supplies',
  'Kitchen & Food',
  'Cleaning Supplies',
  'Laundry',
  'Bathroom',
  'Sleep & Comfort',
  'Entertainment',
  'Decor',
  'Optional Luxury Items',
]

const RAW_CHECKLIST_ITEMS = [
  // ---- Bedding / Essentials ----
  { label: 'Mattress protector', category: 'Bedding', subcategory: 'Essentials' },
  { label: 'Mattress topper (memory foam, gel, egg crate)', category: 'Bedding', subcategory: 'Essentials' },
  { label: 'Fitted sheets (2–3 sets)', category: 'Bedding', subcategory: 'Essentials' },
  { label: 'Flat sheets', category: 'Bedding', subcategory: 'Essentials' },
  { label: 'Pillow(s)', category: 'Bedding', subcategory: 'Essentials' },
  { label: 'Pillowcases', category: 'Bedding', subcategory: 'Essentials' },
  { label: 'Comforter', category: 'Bedding', subcategory: 'Essentials' },
  { label: 'Blanket/throw', category: 'Bedding', subcategory: 'Essentials' },
  // ---- Bedding / Optional ----
  { label: 'Weighted blanket', category: 'Bedding', subcategory: 'Optional' },
  { label: 'Heated blanket', category: 'Bedding', subcategory: 'Optional' },
  { label: 'Decorative pillows', category: 'Bedding', subcategory: 'Optional' },
  { label: 'Bed skirt', category: 'Bedding', subcategory: 'Optional' },

  // ---- Furniture & Organization / Bed ----
  { label: 'Bed risers', category: 'Furniture & Organization', subcategory: 'Bed' },
  { label: 'Bedside caddy', category: 'Furniture & Organization', subcategory: 'Bed' },
  { label: 'Bed shelf', category: 'Furniture & Organization', subcategory: 'Bed' },
  // ---- Furniture & Organization / Closet ----
  { label: 'Hangers', category: 'Furniture & Organization', subcategory: 'Closet' },
  { label: 'Hanging organizer', category: 'Furniture & Organization', subcategory: 'Closet' },
  { label: 'Vacuum storage bags', category: 'Furniture & Organization', subcategory: 'Closet' },
  { label: 'Laundry bag', category: 'Furniture & Organization', subcategory: 'Closet' },
  // ---- Furniture & Organization / Desk ----
  { label: 'Desk organizer', category: 'Furniture & Organization', subcategory: 'Desk' },
  { label: 'Pencil holder', category: 'Furniture & Organization', subcategory: 'Desk' },
  { label: 'File organizer', category: 'Furniture & Organization', subcategory: 'Desk' },
  { label: 'Drawer dividers', category: 'Furniture & Organization', subcategory: 'Desk' },
  { label: 'Monitor stand', category: 'Furniture & Organization', subcategory: 'Desk' },
  // ---- Furniture & Organization / General Storage ----
  { label: 'Plastic bins', category: 'Furniture & Organization', subcategory: 'General Storage' },
  { label: 'Fabric bins', category: 'Furniture & Organization', subcategory: 'General Storage' },
  { label: 'Command hooks', category: 'Furniture & Organization', subcategory: 'General Storage' },
  { label: 'Command strips', category: 'Furniture & Organization', subcategory: 'General Storage' },
  { label: 'Over-the-door organizer', category: 'Furniture & Organization', subcategory: 'General Storage' },
  // ---- Furniture & Organization / Lighting ----
  { label: 'Desk lamp', category: 'Furniture & Organization', subcategory: 'Lighting' },
  { label: 'LED strip lights', category: 'Furniture & Organization', subcategory: 'Lighting' },
  { label: 'Clip-on reading light', category: 'Furniture & Organization', subcategory: 'Lighting' },
  // ---- Furniture & Organization / Entertainment ----
  { label: 'Streaming device', category: 'Furniture & Organization', subcategory: 'Entertainment' },
  { label: 'Gaming console', category: 'Furniture & Organization', subcategory: 'Entertainment' },
  { label: 'Speakers', category: 'Furniture & Organization', subcategory: 'Entertainment' },
  { label: 'Bluetooth speaker', category: 'Furniture & Organization', subcategory: 'Entertainment' },

  // ---- School Supplies / Writing ----
  { label: 'Pens', category: 'School Supplies', subcategory: 'Writing' },
  { label: 'Pencils', category: 'School Supplies', subcategory: 'Writing' },
  { label: 'Highlighters', category: 'School Supplies', subcategory: 'Writing' },
  { label: 'Markers', category: 'School Supplies', subcategory: 'Writing' },
  { label: 'Sticky notes', category: 'School Supplies', subcategory: 'Writing' },
  { label: 'Index cards', category: 'School Supplies', subcategory: 'Writing' },
  // ---- School Supplies / Paper ----
  { label: 'Notebooks', category: 'School Supplies', subcategory: 'Paper' },
  { label: 'Loose-leaf paper', category: 'School Supplies', subcategory: 'Paper' },
  { label: 'Graph paper', category: 'School Supplies', subcategory: 'Paper' },
  { label: 'Planner', category: 'School Supplies', subcategory: 'Paper' },
  { label: 'Calendar', category: 'School Supplies', subcategory: 'Paper' },
  // ---- School Supplies / Office ----
  { label: 'Stapler', category: 'School Supplies', subcategory: 'Office' },
  { label: 'Staples', category: 'School Supplies', subcategory: 'Office' },
  { label: 'Tape', category: 'School Supplies', subcategory: 'Office' },
  { label: 'Scissors', category: 'School Supplies', subcategory: 'Office' },
  { label: 'Ruler', category: 'School Supplies', subcategory: 'Office' },
  { label: 'Hole punch', category: 'School Supplies', subcategory: 'Office' },
  { label: 'Binder clips', category: 'School Supplies', subcategory: 'Office' },
  { label: 'Paper clips', category: 'School Supplies', subcategory: 'Office' },
  // ---- School Supplies / Storage ----
  { label: 'Binders', category: 'School Supplies', subcategory: 'Storage' },
  { label: 'Folders', category: 'School Supplies', subcategory: 'Storage' },
  { label: 'Accordion folder', category: 'School Supplies', subcategory: 'Storage' },

  // ---- Kitchen & Food / Basic Eating ----
  { label: 'Plates', category: 'Kitchen & Food', subcategory: 'Basic Eating' },
  { label: 'Bowls', category: 'Kitchen & Food', subcategory: 'Basic Eating' },
  { label: 'Cups', category: 'Kitchen & Food', subcategory: 'Basic Eating' },
  { label: 'Mugs', category: 'Kitchen & Food', subcategory: 'Basic Eating' },
  { label: 'Water bottle', category: 'Kitchen & Food', subcategory: 'Basic Eating' },
  { label: 'Travel mug', category: 'Kitchen & Food', subcategory: 'Basic Eating' },
  { label: 'Silverware', category: 'Kitchen & Food', subcategory: 'Basic Eating' },
  { label: 'Reusable straws', category: 'Kitchen & Food', subcategory: 'Basic Eating' },
  // ---- Kitchen & Food / Cooking ----
  { label: 'Microwave-safe containers', category: 'Kitchen & Food', subcategory: 'Cooking' },
  { label: 'Measuring cups', category: 'Kitchen & Food', subcategory: 'Cooking' },
  { label: 'Measuring spoons', category: 'Kitchen & Food', subcategory: 'Cooking' },
  { label: 'Cutting board', category: 'Kitchen & Food', subcategory: 'Cooking' },
  { label: 'Knife', category: 'Kitchen & Food', subcategory: 'Cooking' },
  { label: 'Can opener', category: 'Kitchen & Food', subcategory: 'Cooking' },
  { label: 'Bottle opener', category: 'Kitchen & Food', subcategory: 'Cooking' },
  { label: 'Mixing bowl', category: 'Kitchen & Food', subcategory: 'Cooking' },
  // ---- Kitchen & Food / Appliances ----
  { label: 'Coffee maker', category: 'Kitchen & Food', subcategory: 'Appliances' },
  { label: 'Electric kettle', category: 'Kitchen & Food', subcategory: 'Appliances' },
  { label: 'Air fryer', category: 'Kitchen & Food', subcategory: 'Appliances' },
  { label: 'Rice cooker', category: 'Kitchen & Food', subcategory: 'Appliances' },
  { label: 'Blender', category: 'Kitchen & Food', subcategory: 'Appliances' },
  { label: 'Toaster', category: 'Kitchen & Food', subcategory: 'Appliances' },

  // ---- Cleaning Supplies / General ----
  { label: 'Paper towels', category: 'Cleaning Supplies', subcategory: 'General' },
  { label: 'Disinfecting wipes', category: 'Cleaning Supplies', subcategory: 'General' },
  { label: 'Multi-purpose cleaner', category: 'Cleaning Supplies', subcategory: 'General' },
  { label: 'Glass cleaner', category: 'Cleaning Supplies', subcategory: 'General' },
  { label: 'Sponges', category: 'Cleaning Supplies', subcategory: 'General' },
  { label: 'Scrub brush', category: 'Cleaning Supplies', subcategory: 'General' },
  // ---- Cleaning Supplies / Floor ----
  { label: 'Broom', category: 'Cleaning Supplies', subcategory: 'Floor' },
  { label: 'Dustpan', category: 'Cleaning Supplies', subcategory: 'Floor' },
  { label: 'Vacuum', category: 'Cleaning Supplies', subcategory: 'Floor' },
  { label: 'Swiffer', category: 'Cleaning Supplies', subcategory: 'Floor' },
  { label: 'Mop', category: 'Cleaning Supplies', subcategory: 'Floor' },
  // ---- Cleaning Supplies / Trash ----
  { label: 'Recycling bin', category: 'Cleaning Supplies', subcategory: 'Trash' },
  { label: 'Trash bags', category: 'Cleaning Supplies', subcategory: 'Trash' },

  // ---- Laundry / Essentials ----
  { label: 'Laundry basket', category: 'Laundry', subcategory: 'Essentials' },
  { label: 'Laundry bag', category: 'Laundry', subcategory: 'Essentials' },
  { label: 'Detergent', category: 'Laundry', subcategory: 'Essentials' },
  { label: 'Dryer sheets', category: 'Laundry', subcategory: 'Essentials' },
  { label: 'Fabric softener', category: 'Laundry', subcategory: 'Essentials' },
  { label: 'Stain remover', category: 'Laundry', subcategory: 'Essentials' },
  // ---- Laundry / Optional ----
  { label: 'Iron', category: 'Laundry', subcategory: 'Optional' },
  { label: 'Steamer', category: 'Laundry', subcategory: 'Optional' },
  { label: 'Sewing kit', category: 'Laundry', subcategory: 'Optional' },

  // ---- Bathroom / Shower ----
  { label: 'Shower caddy', category: 'Bathroom', subcategory: 'Shower' },
  { label: 'Shower shoes', category: 'Bathroom', subcategory: 'Shower' },
  { label: 'Towels', category: 'Bathroom', subcategory: 'Shower' },
  { label: 'Hand towels', category: 'Bathroom', subcategory: 'Shower' },
  { label: 'Washcloths', category: 'Bathroom', subcategory: 'Shower' },
  { label: 'Bathrobe', category: 'Bathroom', subcategory: 'Shower' },

  // ---- Sleep & Comfort ----
  { label: 'Humidifier', category: 'Sleep & Comfort', subcategory: null },

  // ---- Entertainment / Games ----
  { label: 'Board games', category: 'Entertainment', subcategory: 'Games' },
  { label: 'Playing cards', category: 'Entertainment', subcategory: 'Games' },
  { label: 'Video games', category: 'Entertainment', subcategory: 'Games' },
  // ---- Entertainment / Reading ----
  { label: 'Books', category: 'Entertainment', subcategory: 'Reading' },
  { label: 'Kindle', category: 'Entertainment', subcategory: 'Reading' },
  { label: 'Magazines', category: 'Entertainment', subcategory: 'Reading' },
  // ---- Entertainment / Hobbies ----
  { label: 'Art supplies', category: 'Entertainment', subcategory: 'Hobbies' },

  // ---- Decor / Wall ----
  { label: 'Posters', category: 'Decor', subcategory: 'Wall' },
  { label: 'Pictures', category: 'Decor', subcategory: 'Wall' },
  { label: 'Tapestries', category: 'Decor', subcategory: 'Wall' },
  { label: 'Whiteboard', category: 'Decor', subcategory: 'Wall' },
  { label: 'Corkboard', category: 'Decor', subcategory: 'Wall' },
  // ---- Decor / Room ----
  { label: 'Fake plants', category: 'Decor', subcategory: 'Room' },
  { label: 'LED lights', category: 'Decor', subcategory: 'Room' },
  { label: 'String lights', category: 'Decor', subcategory: 'Room' },
  // Curtains graduated to a real placeable catalog.js entry (id 'curtains') in the long-tail
  // links pass — removed here so it doesn't show up as a redundant checklist-only line too.

  // ---- Optional Luxury Items ----
  { label: 'Espresso machine', category: 'Optional Luxury Items', subcategory: null },
  { label: 'Mini projector', category: 'Optional Luxury Items', subcategory: null },
  { label: 'Air purifier', category: 'Optional Luxury Items', subcategory: null },
]

function slugify(label) {
  return label
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Stable ids derived from each label, for catalog.js's relatedIds ("Goes well with") to
// reference — not stored in the database (checklist_items rows use their own uuid primary key);
// this id only exists client-side, as a lookup key into this file. A couple of labels repeat
// across categories (e.g. "Laundry bag") — disambiguated with a category suffix so ids stay
// unique within this file.
const seenIds = new Set()
export const DEFAULT_CHECKLIST_ITEMS = RAW_CHECKLIST_ITEMS.map((item) => {
  let id = slugify(item.label)
  if (seenIds.has(id)) id = `${id}-${slugify(item.category)}`
  seenIds.add(id)
  return { ...item, id }
})
