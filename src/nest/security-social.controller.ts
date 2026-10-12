import {Body, Controller, Get, Header, HttpCode, Post, Query, Redirect, Req, UseGuards} from "@nestjs/common";
import {SecuritySocialService} from "./security-social.service";
import {SecurityJwtGuard} from "./security-jwt.guard";

type Start = {provider?: unknown; returnUrl?: unknown; codeChallenge?: unknown};
type Callback = {state?: unknown; code?: unknown; error?: unknown; user?: unknown};

@Controller("security/auth/social")
export class SecuritySocialController {
    constructor(private readonly social: SecuritySocialService) {}

    @Get("providers")
    providers() { return {providers: this.social.providers()}; }

    @Post("start") @HttpCode(200)
    start(@Body() body: Start) { return this.social.start(body?.provider, body?.returnUrl, body?.codeChallenge); }

    @Get("method") @UseGuards(SecurityJwtGuard)
    method(@Req() req: {user: {sub: string}}) { return this.social.signInMethod(req.user.sub); }

    @Get("google/callback") @Redirect() @Header("Cache-Control", "no-store") @Header("Referrer-Policy", "no-referrer")
    async google(@Query() query: Callback) { return {url: await this.social.callback("google", query), statusCode: 303}; }

    @Post("apple/callback") @Redirect() @Header("Cache-Control", "no-store") @Header("Referrer-Policy", "no-referrer")
    async apple(@Body() body: Callback) { return {url: await this.social.callback("apple", body), statusCode: 303}; }

    @Post("finish") @HttpCode(200) @Header("Cache-Control", "no-store")
    finish(@Body() body: {ticket?: unknown; codeVerifier?: unknown}) {
        return this.social.finish(body?.ticket, body?.codeVerifier);
    }
}
