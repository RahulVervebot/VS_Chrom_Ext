// Go, Python and Node projects of the same domain must produce comparable specifications.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ProjectManager } = require('../src/core/projectManager');
const { ConfigManager } = require('../src/config/configManager');
const { buildSpec } = require('../src/spec/specBuilder');
const { renderSpec } = require('../src/spec/specRenderer');
const { compareSpecs } = require('../src/spec/specComparator');
const { analyzeRoutes } = require('../src/analyzer/routeAnalyzer');
const { analyzeDatabase } = require('../src/analyzer/databaseAnalyzer');
const { analyzeValidation } = require('../src/analyzer/validationAnalyzer');
const { tempProject } = require('./helpers');
const logger = require('../src/utils/logger');

logger.setSink(() => {});

function write(root, files) { for (const [rel, content] of Object.entries(files)) { const abs = path.join(root, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content); } return root; }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-lang-'));
async function open(root, name) { const pm = new ProjectManager({ root, config: new ConfigManager() }); await pm.load(); await pm.initialize(name); await pm.scan(); await pm.documentation.updateAll(); return pm; }

const GO = {
  'go.mod': 'module example.com/shop\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n\tgorm.io/gorm v1.25.5\n\tgithub.com/stripe/stripe-go/v76 v76.1.0\n)\n',
  'main.go': 'package main\n\nimport (\n\t"os"\n\t"github.com/gin-gonic/gin"\n)\n\nfunc main() {\n\tr := gin.Default()\n\tapi := r.Group("/api", AuthRequired())\n\tapi.POST("/orders", handlers.CreateOrder)\n\tapi.GET("/orders/:id", handlers.GetOrder)\n\t_ = os.Getenv("STRIPE_KEY")\n\tr.Run(":" + os.Getenv("PORT"))\n}\n',
  'models/order.go': 'package models\n\nimport "gorm.io/gorm"\n\ntype Order struct {\n\tgorm.Model\n\tUserID uint `gorm:"not null;index"`\n\tTotal float64 `gorm:"not null"`\n\tStatus string `gorm:"default:PENDING;size:20"`\n\tCoupon string `gorm:"size:12"`\n}\n\ntype User struct {\n\tID uint `gorm:"primaryKey"`\n\tEmail string `gorm:"uniqueIndex;not null;size:255" json:"email" binding:"required,email"`\n}\n',
  'handlers/order_handler.go': 'package handlers\n\nimport (\n\t"net/http"\n\t"github.com/gin-gonic/gin"\n)\n\nfunc CreateOrder(c *gin.Context) {\n\tvar o models.Order\n\tif err := c.ShouldBindJSON(&o); err != nil {\n\t\tc.JSON(http.StatusBadRequest, gin.H{"error": "Cart is empty"})\n\t\treturn\n\t}\n\tdb.Create(&o)\n}\n\nfunc GetOrder(c *gin.Context) {\n\tvar o models.Order\n\tdb.First(&o, c.Param("id"))\n}\n',
};
const PY = {
  'requirements.txt': 'Flask==2.3.2\nSQLAlchemy==2.0.20\nstripe==5.5.0\npydantic==2.5.0\n',
  'app.py': 'import os\nfrom flask import Flask, abort\nfrom models import Order\n\napp = Flask(__name__)\nstripe_key = os.environ.get("STRIPE_KEY")\n\n@app.route("/api/orders", methods=["POST"])\ndef create_order():\n    if not request.json:\n        abort(400, "Cart is empty")\n    Order.query.filter_by(id=1).first()\n\n@app.route("/api/orders/<int:order_id>")\ndef get_order(order_id):\n    return Order.query.get(order_id)\n',
  'models.py': 'from sqlalchemy import Column, Integer, String, Float\nfrom sqlalchemy.orm import declarative_base\n\nBase = declarative_base()\n\nclass Order(Base):\n    __tablename__ = "orders"\n    id = Column(Integer, primary_key=True)\n    user_id = Column(Integer, nullable=False)\n    total = Column(Float, nullable=False)\n    status = Column(String(20), default="PENDING")\n    discount = Column(String(8))\n',
  'schemas.py': 'from pydantic import BaseModel, EmailStr, Field\n\nclass OrderIn(BaseModel):\n    email: EmailStr\n    qty: int = Field(..., ge=1)\n',
};

test('Go: gin groups + middleware, GORM models with relations, struct-tag validation, GORM calls, env, go.mod', async () => {
  const { routes } = analyzeRoutes('main.go', GO['main.go'], 'go');
  assert.deepStrictEqual(routes.map((r) => `${r.method} ${r.path}`), ['POST /api/orders', 'GET /api/orders/:id']);
  assert.ok(routes.every((r) => r.middleware.includes('AuthRequired')));
  const db = analyzeDatabase(GO['models/order.go'], 'go', 'models/order.go');
  const order = db.entities.find((e) => e.name === 'Order');
  assert.deepStrictEqual(order.fields.map((f) => f.name), ['ID', 'CreatedAt', 'UpdatedAt', 'DeletedAt', 'UserID', 'Total', 'Status', 'Coupon']);
  assert.strictEqual(order.fields.find((f) => f.name === 'Total').type, 'float');
  assert.ok(db.entities.find((e) => e.name === 'User').fields.find((f) => f.name === 'Email').unique);
  const v = analyzeValidation(GO['models/order.go'], 'go', false);
  assert.deepStrictEqual(v.find((x) => x.kind === 'schema' && x.field === 'Total').rules, ['required']);
  assert.deepStrictEqual(v.find((x) => x.kind === 'gin-binding').rules, ['required', 'email']);
  const calls = analyzeDatabase(GO['handlers/order_handler.go'], 'go', 'handlers/order_handler.go').ormCalls;
  assert.deepStrictEqual(calls.map((c) => `${c.receiver}.${c.operation}:${c.kind}`), ['Order.Create:write', 'Order.First:read']);
  assert.ok(analyzeValidation(GO['handlers/order_handler.go'], 'go', false).some((x) => x.kind === 'guard' && /Cart is empty/.test(x.rules[0])));
});

test('Python: Flask <int:id> routes, SQLAlchemy columns, pydantic fields, requirements versions', () => {
  const { routes } = analyzeRoutes('app.py', PY['app.py'], 'python');
  assert.deepStrictEqual(routes.map((r) => `${r.method} ${r.path}`), ['POST /api/orders', 'GET /api/orders/<int:order_id>']);
  const db = analyzeDatabase(PY['models.py'], 'python', 'models.py');
  assert.deepStrictEqual(db.entities.map((e) => e.name), ['Order']);
  assert.deepStrictEqual(db.entities[0].fields.map((f) => f.name), ['id', 'user_id', 'total', 'status', 'discount']);
  const v = analyzeValidation(PY['models.py'], 'python', false);
  assert.deepStrictEqual(v.find((x) => x.field === 'total').rules, ['required']);
  assert.deepStrictEqual(v.find((x) => x.field === 'status').rules, ['maxlength(20)', "default(\"PENDING\")"]);
  const p = analyzeValidation(PY['schemas.py'], 'python', false);
  assert.deepStrictEqual(p.find((x) => x.field === 'email').rules, ['required', 'type(email)']);
  assert.deepStrictEqual(p.find((x) => x.field === 'qty').rules, ['required', 'min(1)']);
  assert.ok(!analyzeDatabase(PY['schemas.py'], 'python', 'schemas.py').entities.length, 'a pydantic schema is not a table');
});

test('Node vs Go vs Python projects of the same domain are matched feature by feature, table by table, field by field', async () => {
  const node = await open(tempProject(), 'Node shop');
  const go = await open(write(tmp(), GO), 'Go shop');
  const py = await open(write(tmp(), PY), 'Python shop');
  const [sn, sg, sp] = [await buildSpec(node.root), await buildSpec(go.root), await buildSpec(py.root)];

  assert.ok(sg.features.some((f) => f.name === 'order') && sp.features.some((f) => f.name === 'order'), 'feature "order" found in Go and Python');
  assert.ok(sg.apis.some((a) => a.key === 'POST /api/orders') && sg.apis.some((a) => a.key === 'GET /api/orders/:param'), 'Go endpoints are normalised');
  assert.ok(sp.apis.some((a) => a.key === 'GET /api/orders/:param'), 'Flask <int:order_id> becomes :param');
  assert.deepStrictEqual(sg.database.entities.map((e) => e.name).sort(), ['Order', 'User']);
  assert.ok(sg.environment.variables.some((v) => v.name === 'STRIPE_KEY') && sp.environment.variables.some((v) => v.name === 'STRIPE_KEY'));
  assert.ok(sg.stack.runtimeModules.some((m) => m.name === 'github.com/gin-gonic/gin' && m.ecosystem === 'go') && sp.stack.runtimeModules.some((m) => m.name === 'flask' && m.ecosystem === 'pip'));

  const goVsNode = compareSpecs(sn, sg);
  const cat = (m, id) => m.categories.find((c) => c.id === id);
  assert.ok(cat(goVsNode, 'features').common.some((x) => x.label === 'order'), 'order feature matches across Node and Go');
  assert.ok(cat(goVsNode, 'apis').common.some((x) => x.label === 'POST /api/orders'), 'same endpoint matches (:id vs :param)');
  assert.ok(cat(goVsNode, 'tables').common.some((x) => /order/i.test(x.label)), 'Order table matches');
  assert.ok(cat(goVsNode, 'fields').common.some((x) => /total/i.test(x.label)), 'total field matches');
  assert.ok(cat(goVsNode, 'fields').onlyB.some((x) => /Coupon/.test(x.label)), 'a Go-only field is reported');
  assert.ok(cat(goVsNode, 'stack').onlyB.some((x) => x.label === 'go') && cat(goVsNode, 'stack').onlyA.some((x) => x.label === 'javascript'), 'languages are compared');
  assert.ok(cat(goVsNode, 'modules').onlyB.every((x) => /\[go\]/.test(x.label)), 'Go modules never match npm packages by name');

  const pyVsGo = compareSpecs(sp, sg);
  assert.ok(cat(pyVsGo, 'fields').common.some((x) => /user_?id/i.test(x.label)), 'user_id (SQLAlchemy) matches UserID (GORM)');
  assert.ok(cat(pyVsGo, 'fields').common.some((x) => /status/i.test(x.label)));
  assert.ok(cat(pyVsGo, 'validation').common.length >= 1, 'validation rules matched across Python and Go');
  assert.ok(renderSpec(sg).text.includes('github.com/gin-gonic/gin v1.9.1') && renderSpec(sp).text.includes('flask'));
});
