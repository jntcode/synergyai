import type { FieldValues, Resolver } from "react-hook-form";
import type { ZodType } from "zod";

/**
 * Minimal typed Zod resolver for react-hook-form.
 * (We avoid @hookform/resolvers because its current release has a conflicting
 * optional peer dependency on effect@4.)
 */
export function zodResolver<T extends FieldValues>(
  schema: ZodType<T>,
): Resolver<T> {
  const fn = async (values: T) => {
    const result = schema.safeParse(values);
    if (result.success) {
      return { values: result.data, errors: {} };
    }
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join(".") : "__root";
      if (!errors[key]) {
        errors[key] = { type: issue.code, message: issue.message };
      }
    }
    return { values: {} as T, errors };
  };
  return fn as unknown as Resolver<T>;
}
