import {
  authenticate,
  errorResponse,
  getDashboardData,
  jsonResponse,
} from "../_lib/airtable.js";

export async function onRequestGet({ request, env }) {
  const auth = authenticate(request, env);
  if (auth.error) return auth.error;

  try {
    const dashboard = await getDashboardData(auth.user, env);
    return jsonResponse({
      user: dashboard.user,
      date: dashboard.today.date,
      calories: dashboard.today.calories,
      protein: dashboard.today.protein,
      junkCalories: dashboard.today.junkCalories,
      alcoholCalories: dashboard.today.alcoholCalories,
      eatingOutCalories: dashboard.today.eatingOutCalories,
      updatedAt: dashboard.updatedAt,
    });
  } catch (error) {
    return errorResponse(error.message || "Unable to load widget data.", 500);
  }
}
