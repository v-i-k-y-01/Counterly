using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using PosBackend.Application.Reports;
using PosBackend.Domain.Entities;
using PosBackend.Domain.Enums;
using PosBackend.Infrastructure.Persistence;
using PosBackend.UnitTests.Common;
using Xunit;

namespace PosBackend.UnitTests.Reports;

public class ReportHandlersTests
{
    private static AppDbContext CreateInMemoryDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: $"PosReportsTest_{Guid.NewGuid()}")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;

        return new AppDbContext(options);
    }

    [Fact]
    public async Task GetDailyRevenue_ShouldAggregateSaleCountRevenueAndItemsSoldPerDay()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var storeId = Guid.NewGuid();
        var otherStoreId = Guid.NewGuid();
        var currentUser = new TestCurrentUserService
        {
            StoreId = storeId,
            UserId = Guid.NewGuid(),
            IsOwner = true
        };

        var day1 = new DateTime(2026, 11, 20, 10, 0, 0, DateTimeKind.Utc);
        var day2 = new DateTime(2026, 11, 21, 15, 30, 0, DateTimeKind.Utc);

        var p1Id = Guid.NewGuid();
        var p2Id = Guid.NewGuid();

        dbContext.Sales.AddRange(
            new Sale
            {
                Id = Guid.NewGuid(),
                StoreId = storeId,
                CashierId = currentUser.UserId,
                PaymentMethod = PaymentMethod.Cash,
                TotalAmount = 250.00m,
                CreatedAt = day1,
                Items =
                {
                    new SaleItem { Id = Guid.NewGuid(), ProductId = p1Id, Quantity = 2, UnitPrice = 50.00m, Subtotal = 100.00m },
                    new SaleItem { Id = Guid.NewGuid(), ProductId = p2Id, Quantity = 3, UnitPrice = 50.00m, Subtotal = 150.00m }
                }
            },
            new Sale
            {
                Id = Guid.NewGuid(),
                StoreId = storeId,
                CashierId = currentUser.UserId,
                PaymentMethod = PaymentMethod.Card,
                TotalAmount = 100.00m,
                CreatedAt = day1.AddHours(2),
                Items =
                {
                    new SaleItem { Id = Guid.NewGuid(), ProductId = p1Id, Quantity = 1, UnitPrice = 100.00m, Subtotal = 100.00m }
                }
            },
            new Sale
            {
                Id = Guid.NewGuid(),
                StoreId = storeId,
                CashierId = currentUser.UserId,
                PaymentMethod = PaymentMethod.Upi,
                TotalAmount = 400.00m,
                CreatedAt = day2,
                Items =
                {
                    new SaleItem { Id = Guid.NewGuid(), ProductId = p2Id, Quantity = 4, UnitPrice = 100.00m, Subtotal = 400.00m }
                }
            },
            new Sale
            {
                Id = Guid.NewGuid(),
                StoreId = otherStoreId,
                CashierId = Guid.NewGuid(),
                PaymentMethod = PaymentMethod.Cash,
                TotalAmount = 999.00m,
                CreatedAt = day1,
                Items =
                {
                    new SaleItem { Id = Guid.NewGuid(), ProductId = p1Id, Quantity = 10, UnitPrice = 99.90m, Subtotal = 999.00m }
                }
            });

        await dbContext.SaveChangesAsync();

        var handler = new ReportHandlers(dbContext, currentUser);

        // Act
        var allDays = await handler.Handle(new GetDailyRevenueQuery(), CancellationToken.None);
        var filteredDay1 = await handler.Handle(
            new GetDailyRevenueQuery(new DateOnly(2026, 11, 20), new DateOnly(2026, 11, 20)),
            CancellationToken.None);

        // Assert
        allDays.Should().HaveCount(2);
        allDays[0].Should().Be(new DailyRevenueDto(new DateOnly(2026, 11, 20), 2, 350.00m, 6));
        allDays[1].Should().Be(new DailyRevenueDto(new DateOnly(2026, 11, 21), 1, 400.00m, 4));

        filteredDay1.Should().ContainSingle();
        filteredDay1[0].ItemsSold.Should().Be(6);
    }

    [Fact]
    public async Task GetDailyRevenue_ShouldGroupByClientTimezoneOffset()
    {
        // Arrange
        using var dbContext = CreateInMemoryDbContext();
        var storeId = Guid.NewGuid();
        var currentUser = new TestCurrentUserService
        {
            StoreId = storeId,
            UserId = Guid.NewGuid(),
            IsOwner = true
        };

        // 2026-11-25 18:32 UTC == 2026-11-26 00:02 IST (+05:30)
        var utcSaleTime = new DateTime(2026, 11, 25, 18, 32, 0, DateTimeKind.Utc);
        dbContext.Sales.Add(new Sale
        {
            Id = Guid.NewGuid(),
            StoreId = storeId,
            CashierId = currentUser.UserId,
            PaymentMethod = PaymentMethod.Cash,
            TotalAmount = 380.00m,
            CreatedAt = utcSaleTime,
            Items =
            {
                new SaleItem { Id = Guid.NewGuid(), ProductId = Guid.NewGuid(), Quantity = 3, UnitPrice = 100.00m, Subtotal = 300.00m },
                new SaleItem { Id = Guid.NewGuid(), ProductId = Guid.NewGuid(), Quantity = 2, UnitPrice = 40.00m, Subtotal = 80.00m }
            }
        });
        await dbContext.SaveChangesAsync();

        var handler = new ReportHandlers(dbContext, currentUser);

        // Act
        var istRevenue = await handler.Handle(
            new GetDailyRevenueQuery(new DateOnly(2026, 11, 26), new DateOnly(2026, 11, 26), TzOffsetMinutes: 330),
            CancellationToken.None);

        // Assert
        istRevenue.Should().ContainSingle();
        istRevenue[0].Should().Be(new DailyRevenueDto(new DateOnly(2026, 11, 26), 1, 380.00m, 5));
    }
}
