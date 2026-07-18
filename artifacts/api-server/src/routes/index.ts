import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cardsRouter from "./cards";
import tagsRouter from "./tags";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/cards", cardsRouter);
router.use("/tags", tagsRouter);

export default router;
