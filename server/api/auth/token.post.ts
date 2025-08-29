import type { H3Event } from 'h3'
import { UserService } from '../../crud/users'
import { tokenHandler } from '../../security/tokens'
import type { FirnUser } from '../../../types/auth'

export default defineEventHandler(async (event: H3Event) => {

    // retrieve the token from the authorization header
    const token = await tokenHandler.extractTokenFromHeader(event)

    if (token && token.length > 0) {
        // check that it is a valid user token (aka general auth token)
        const result = await tokenHandler.verifyFirnUserToken(token, 'user')

        if (result.error) {
            await replaceUserSession(event, {
                authStatus: {
                    kind: 'error',
                    reject: true,
                    title: 'Error verifying token',
                    message: result.error
                }
            })
            throw createError({
                statusCode: 400,
                message: result.error
            })
        }

        if (result.user) {
            // convert the user object to a session user object
            const [sessionUser, sessionUserSecure] = await UserService.convertToSessionUser(result.user as FirnUser, 'token')

            if(!sessionUserSecure.allowLogin) {
                await replaceUserSession(event, {
                    authStatus: {
                        kind: 'error',
                        reject: true,
                        title: 'Error verifying token',
                        message: 'Your user account has been suspended and is not allowed to login.'
                    }
                })
                throw createError({
                    statusCode: 403,
                    message: 'Your user account has been suspended and is not allowed to login.'
                })
            }

            if(sessionUserSecure.isRetired) {
                await replaceUserSession(event, {
                    authStatus: {
                        kind: 'error',
                        reject: true,
                        title: 'Error verifying token',
                        message: 'Your user account has been retired.'
                    }
                })
                throw createError({
                    statusCode: 403,
                    message: 'Your user account has been retired.'
                })
            }

            await replaceUserSession(event, {
                user: sessionUser,
                secure: sessionUserSecure,
                authStatus: {
                    kind: 'success',
                    reject: false,
                    title: 'Welcome to Firn!',
                    message: `Successfully signed in as ${sessionUser.name}.`
                }
            })
            // retrieve the redirect URL from the request parameters
            const redirectUrl = getQuery(event).redirectUrl as string || '/firn';
            return sendRedirect(event, redirectUrl, 201)
            
        } else {
            await replaceUserSession(event, {
                authStatus: {
                    kind: 'error',
                    reject: true,
                    title: 'Invalid token',
                    message: 'The token is invalid or has expired.'
                }
            })
            throw createError({
                statusCode: 401,
                message: 'Invalid token'
            })
        }
    } else {
        await replaceUserSession(event, {
            authStatus: {
                kind: 'error',
                reject: true,
                title: 'Invalid token',
                message: 'The token is invalid or has expired.'
            }
        })
        throw createError({
            statusCode: 401,
            message: 'Invalid token'
        })
    }
})