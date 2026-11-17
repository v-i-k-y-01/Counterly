using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PosBackend.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Sales_StoreId",
                table: "Sales");

            migrationBuilder.CreateIndex(
                name: "IX_Sales_StoreId_CreatedAt",
                table: "Sales",
                columns: new[] { "StoreId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Products_StoreId_CategoryId",
                table: "Products",
                columns: new[] { "StoreId", "CategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_Products_StoreId_Name",
                table: "Products",
                columns: new[] { "StoreId", "Name" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Sales_StoreId_CreatedAt",
                table: "Sales");

            migrationBuilder.DropIndex(
                name: "IX_Products_StoreId_CategoryId",
                table: "Products");

            migrationBuilder.DropIndex(
                name: "IX_Products_StoreId_Name",
                table: "Products");

            migrationBuilder.CreateIndex(
                name: "IX_Sales_StoreId",
                table: "Sales",
                column: "StoreId");
        }
    }
}
