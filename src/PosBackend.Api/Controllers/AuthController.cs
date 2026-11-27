using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using PosBackend.Application.Auth.Commands;
using PosBackend.Application.Auth.Dtos;

namespace PosBackend.Api.Controllers;

/// <summary>
/// Handles authentication endpoints such as owner registration, login, and profile name completion.
/// </summary>
[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly ISender _sender;

    /// <summary>
    /// Initializes a new instance of the <see cref="AuthController"/> class.
    /// </summary>
    /// <param name="sender">The MediatR sender utility.</param>
    public AuthController(ISender sender)
    {
        _sender = sender;
    }

    /// <summary>
    /// Registers the initial Owner account for the Point-of-Sale shop.
    /// </summary>
    /// <param name="request">Payload carrying the email, password, name, and store details for the owner.</param>
    /// <param name="cancellationToken">Token to monitor for cancellation requests.</param>
    /// <returns>The details of the created owner account.</returns>
    [HttpPost("register")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<UserResponse>> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        var registeredUser = await _sender.Send(
            new RegisterOwnerCommand(request.Email, request.Password, request.StoreName, request.FirstName, request.LastName),
            cancellationToken);

        return Created(string.Empty, registeredUser);
    }

    /// <summary>
    /// Authenticates a user with email and password, returning access and refresh JWTs.
    /// </summary>
    /// <param name="request">Payload carrying login credentials.</param>
    /// <param name="cancellationToken">Token to monitor for cancellation requests.</param>
    /// <returns>Tokens and expiration information.</returns>
    [HttpPost("login")]
    [ProducesResponseType(typeof(TokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<TokenResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var tokenResponse = await _sender.Send(
            new LoginCommand(request.Email, request.Password),
            cancellationToken);

        return Ok(tokenResponse);
    }

    /// <summary>
    /// Saves the authenticated user's first and last name and returns refreshed JWTs containing the name claims.
    /// </summary>
    /// <param name="request">Payload carrying the user's first and last name.</param>
    /// <param name="cancellationToken">Token to monitor for cancellation requests.</param>
    /// <returns>Refreshed access and refresh tokens with updated profile claims.</returns>
    [Authorize]
    [HttpPut("profile")]
    [ProducesResponseType(typeof(TokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<TokenResponse>> UpdateProfileName(UpdateProfileNameRequest request, CancellationToken cancellationToken)
    {
        var tokenResponse = await _sender.Send(
            new UpdateUserNameCommand(request.FirstName, request.LastName),
            cancellationToken);

        return Ok(tokenResponse);
    }
}

/// <summary>
/// Request contract for Owner registration.
/// </summary>
/// <param name="Email">The requested email address.</param>
/// <param name="Password">The desired secure password.</param>
/// <param name="StoreName">Optional name of the business/store.</param>
/// <param name="FirstName">The owner's first name.</param>
/// <param name="LastName">The owner's last name.</param>
public sealed record RegisterRequest(
    string Email,
    string Password,
    string? StoreName = null,
    string? FirstName = null,
    string? LastName = null);

/// <summary>
/// Request contract for login authentication.
/// </summary>
/// <param name="Email">The user's email address.</param>
/// <param name="Password">The user's password.</param>
public sealed record LoginRequest(string Email, string Password);

/// <summary>
/// Request contract for completing or updating the authenticated user's first and last name.
/// </summary>
/// <param name="FirstName">The user's first name.</param>
/// <param name="LastName">The user's last name.</param>
public sealed record UpdateProfileNameRequest(string FirstName, string LastName);
