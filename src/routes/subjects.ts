import { and, desc, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import express from 'express'
import { departments, subjects } from '../db/schema/index.js';
import { db } from '../db/index.js';

const router = express.Router()

// Get all subjects with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        const { search, department, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(page as string) || 1);
        const limitPerPage = Math.max(1, parseInt(limit as string) || 10);

        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];
        // If search query is provided, filter subjects by name or subject code
        if (search) {
            filterConditions.push(
                or(
                    ilike(subjects.name, `%${search}%`),
                    ilike(subjects.code, `%${search}%`)
                )
            )
        }

        // If department query is provided, filter subjects by department name
        if (department) {
            const deptPattern = `%${String(department).replace(/%/g, '\\%')}%`
            filterConditions.push(ilike(departments.name, deptPattern))
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)

        const totalCount = countResult[0]?.count ?? 0;

        const subjectsList = await db.select({
            ...getTableColumns(subjects),
            department: { ...getTableColumns(departments) }
        }).from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)
            .orderBy(desc(subjects.createdAt))
            .limit(limitPerPage)
            .offset(offset)


        return res.status(200).json({
            data: subjectsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage)
            }
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ error: "Internal server error" })
    }
})

// POST /subjects — create
router.post("/", async (req, res) => {
    try {
        const { name, code, description, departmentId } = req.body;

        if (!name?.trim() || !code?.trim()) {
            return res.status(400).json({ error: "name and code are required" });
        }

        const [created] = await db
            .insert(subjects)
            .values({ name: name.trim(), code: code.trim(), description, departmentId })
            .returning();

        res.status(201).json({ data: created });
    } catch (error: any) {
        // Postgres unique-violation code
        if (error?.code === "23505") {
            return res.status(409).json({ error: "Subject code already exists" });
        }
        console.error("POST /subjects error:", error);
        res.status(500).json({ error: "Failed to create subject" });
    }
});

// GET /subjects/:id — detail with department
router.get("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "Invalid subject id" });
        }

        const [subject] = await db
            .select({
                ...getTableColumns(subjects),
                department: { ...getTableColumns(departments) },
            })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(eq(subjects.id, id));

        if (!subject) {
            return res.status(404).json({ error: "Subject not found" });
        }

        res.status(200).json({ data: subject });
    } catch (error) {
        console.error("GET /subjects/:id error:", error);
        res.status(500).json({ error: "Failed to fetch subject" });
    }
});

// PUT /subjects/:id — update
router.put("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "Invalid subject id" });
        }

        const { name, code, description, departmentId } = req.body;

        const patch: Record<string, any> = {};
        if (name !== undefined) patch.name = name;
        if (code !== undefined) patch.code = code;
        if (description !== undefined) patch.description = description;
        if (departmentId !== undefined) patch.departmentId = departmentId;

        const [updated] = await db
            .update(subjects)
            .set(patch)
            .where(eq(subjects.id, id))
            .returning();

        if (!updated) {
            return res.status(404).json({ error: "Subject not found" });
        }

        res.status(200).json({ data: updated });
    } catch (error) {
        console.error("PUT /subjects/:id error:", error);
        res.status(500).json({ error: "Failed to update subject" });
    }
});

// DELETE /subjects/:id — delete (fails if classes reference it)
router.delete("/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            return res.status(400).json({ error: "Invalid subject id" });
        }

        // Import classes here to avoid circular at top; classes references subjects via FK
        const { classes } = await import("../db/schema/index.js");

        const childClasses = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(classes)
            .where(eq(classes.subjectId, id));

        if ((childClasses[0]?.count ?? 0) > 0) {
            return res.status(409).json({
                error: "Cannot delete subject with existing classes. Remove all classes first.",
            });
        }

        const [deleted] = await db
            .delete(subjects)
            .where(eq(subjects.id, id))
            .returning({ id: subjects.id });

        if (!deleted) {
            return res.status(404).json({ error: "Subject not found" });
        }

        res.status(200).json({ data: deleted });
    } catch (error) {
        console.error("DELETE /subjects/:id error:", error);
        res.status(500).json({ error: "Failed to delete subject" });
    }
});

export default router