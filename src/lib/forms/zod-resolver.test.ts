import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodResolver } from "@/lib/forms/zod-resolver";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  age: z.number().min(18, "Must be 18+"),
});

describe("zodResolver", () => {
  it("returns parsed values and no errors on success", async () => {
    const resolver = zodResolver(schema);
    const result = await resolver({ email: "a@b.com", age: 30 }, {} as never, {} as never);
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ email: "a@b.com", age: 30 });
  });

  it("maps issues to field-keyed errors", async () => {
    const resolver = zodResolver(schema);
    const result = await resolver({ email: "nope", age: 12 }, {} as never, {} as never);
    expect(result.values).toEqual({});
    expect(result.errors.email?.message).toBe("Enter a valid email");
    expect(result.errors.age?.message).toBe("Must be 18+");
  });

  it("keeps the first error per field", async () => {
    const multi = z.object({
      name: z.string().min(3, "too short").max(2, "too long"),
    });
    const resolver = zodResolver(multi);
    const result = await resolver({ name: "a" }, {} as never, {} as never);
    expect(result.errors.name?.message).toBe("too short");
  });

  it("supports nested paths joined with dots", async () => {
    const nested = z.object({ user: z.object({ email: z.string().email() }) });
    type Nested = z.infer<typeof nested>;
    const resolver = zodResolver(nested);
    const result = await resolver({ user: { email: "bad" } }, {} as never, {} as never);
    expect((result.errors as Record<string, unknown>)["user.email"]).toBeDefined();
    void ({} as Nested);
  });
});
