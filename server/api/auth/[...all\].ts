import { auth } from "../../utils/betterAuth"

export default defineEventHandler((event) => {
    return auth.handler(toWebRequest(event));
});