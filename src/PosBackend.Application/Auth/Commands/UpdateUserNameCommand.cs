using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using PosBackend.Application.Auth.Dtos;
using PosBackend.Application.Common.Exceptions;
using PosBackend.Application.Common.Interfaces;

namespace PosBackend.Application.Auth.Commands;

/// <summary>
/// Command to set or update the authenticated user's first and last name and reissue JWT tokens.
/// Used when an invited or legacy user signs in without name details on record.
/// </summary>
/// <param name="FirstName">The user's first name.</param>
/// <param name="LastName">The user's last name.</param>
public sealed record UpdateUserNameCommand(string FirstName, string LastName) : IRequest<TokenResponse>;

/// <summary>
/// Validator governing rules for updating the authenticated user's name.
/// </summary>
public sealed class UpdateUserNameCommandValidator : AbstractValidator<UpdateUserNameCommand>
{
    /// <summary>
    /// Initializes a new instance of the <see cref="UpdateUserNameCommandValidator"/> class.
    /// </summary>
    public UpdateUserNameCommandValidator()
    {
        RuleFor(command => command.FirstName)
            .NotEmpty().WithMessage("First name is required.")
            .MaximumLength(100).WithMessage("First name cannot exceed 100 characters.");

        RuleFor(command => command.LastName)
            .NotEmpty().WithMessage("Last name is required.")
            .MaximumLength(100).WithMessage("Last name cannot exceed 100 characters.");
    }
}

/// <summary>
/// Handler that updates the current user's first and last name and returns refreshed JWT tokens.
/// </summary>
public sealed class UpdateUserNameCommandHandler : IRequestHandler<UpdateUserNameCommand, TokenResponse>
{
    private readonly IAppDbContext _dbContext;
    private readonly ICurrentUserService _currentUserService;
    private readonly ITokenService _tokenService;

    /// <summary>
    /// Initializes a new instance of the <see cref="UpdateUserNameCommandHandler"/> class.
    /// </summary>
    public UpdateUserNameCommandHandler(
        IAppDbContext dbContext,
        ICurrentUserService currentUserService,
        ITokenService tokenService)
    {
        _dbContext = dbContext;
        _currentUserService = currentUserService;
        _tokenService = tokenService;
    }

    /// <summary>
    /// Updates the authenticated user's name in the database and issues updated tokens with name claims.
    /// </summary>
    public async Task<TokenResponse> Handle(UpdateUserNameCommand request, CancellationToken cancellationToken)
    {
        var userId = _currentUserService.UserId;

        var user = await _dbContext.Users
            .Include(u => u.Store)
            .SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user is null)
        {
            throw new NotFoundException("User", userId);
        }

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();

        await _dbContext.SaveChangesAsync(cancellationToken);

        return _tokenService.CreateTokens(user);
    }
}
