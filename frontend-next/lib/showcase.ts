// Real proof for the homepage. Each section stays hidden until you add at least one entry.
//
// RECENT_ORDERS: photos of products you actually sourced (flat-lays, unboxings, hands only, no faces).
//   1. Put the photo in public/showcase/ (e.g. public/showcase/tumblers.jpg, roughly 800x800).
//   2. Add an entry: { src: '/showcase/tumblers.jpg', title: '100 branded tumblers', note: 'Event favours · Nassau' }
//
// REVIEWS: real customers only, with their permission. Use what they agreed to show
//   (first name, business name or island), e.g.
//   { quote: 'Arrived in perfect shape and the logo print was sharp.', name: 'Island Treats', place: 'Nassau' }

export type RecentOrder = { src: string; title: string; note?: string }
export type Review = { quote: string; name: string; place?: string }

export const RECENT_ORDERS: RecentOrder[] = []
export const REVIEWS: Review[] = []
