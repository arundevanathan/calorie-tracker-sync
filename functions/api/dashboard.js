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
    const dashboard = await getDashboardData(auth.user, auth.person, env);
    return jsonResponse(dashboard);
  } catch (error) {
    return errorResponse(error.message || "Unable to load dashboard data.", 500);
  }
}
