import { serverAuth } from "../../utils/betterAuth"

export default defineEventHandler((event) => {
    return serverAuth().handler(toWebRequest(event));
});