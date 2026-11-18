// The seller tools a plan can include or leave out. The plans table stores these keys (plans.features); the API refuses
// a tool's routes when the store's plan does not include it (guardPlanFeatures in api/src/plans.ts), and the storefront
// closes the online store without `onlineStore`. Landing pages, orders, products and media are in every plan.
export const planFeatures = [
  'onlineStore', 'customDomain', 'courierBooking', 'discounts', 'fakeOrderProtection', 'incompleteOrders', 'repeatSales', 'analytics', 'adTracking',
] as const
export type PlanFeature = (typeof planFeatures)[number]
export const isPlanFeature = (v: unknown): v is PlanFeature => planFeatures.includes(v as PlanFeature)

// Names in both languages for the dashboard (Bangla first) and the console.
export const planFeatureLabels: Record<PlanFeature, readonly [string, string]> = {
  onlineStore: ['অনলাইন স্টোর (হোম, ক্যাটাগরি, কার্ট)', 'Online store (home, collections, cart)'],
  customDomain: ['নিজের ডোমেইন', 'Own domain'],
  courierBooking: ['কুরিয়ারে এক ক্লিকে বুকিং (Steadfast)', 'One-click courier booking (Steadfast)'],
  discounts: ['ডিসকাউন্ট ও কুপন', 'Discounts and coupons'],
  fakeOrderProtection: ['ভুয়া অর্ডার থেকে সুরক্ষা', 'Fake-order protection'],
  incompleteOrders: ['অসম্পূর্ণ অর্ডার', 'Incomplete orders'],
  repeatSales: ['রিপিট সেল', 'Repeat sales'],
  analytics: ['হিসাব ও লাভ', 'Analytics and profit'],
  adTracking: ['বিজ্ঞাপন ট্র্যাকিং (Meta, TikTok পিক্সেল)', 'Ad tracking (Meta and TikTok pixels)'],
}
