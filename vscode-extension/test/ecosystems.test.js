// Breadth: the analysis must read the common project structures of every major ecosystem, not just one framework.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ProjectManager } = require('../src/core/projectManager');
const { ConfigManager } = require('../src/config/configManager');
const { buildSpec } = require('../src/spec/specBuilder');
const { compareSpecs } = require('../src/spec/specComparator');
const { analyzeRoutes } = require('../src/analyzer/routeAnalyzer');
const { analyzeDatabase } = require('../src/analyzer/databaseAnalyzer');
const { analyzeValidation } = require('../src/analyzer/validationAnalyzer');
const { analyzeFile } = require('../src/analyzer/fileAnalyzer');
const { tempProject } = require('./helpers');
require('../src/utils/logger').setSink(() => {});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-eco-'));
function write(root, files) { for (const [rel, content] of Object.entries(files)) { const abs = path.join(root, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content); } return root; }
async function open(root, name) { const pm = new ProjectManager({ root, config: new ConfigManager() }); await pm.load(); await pm.initialize(name); await pm.scan(); await pm.documentation.updateAll(); return pm; }
const keys = (routes) => routes.map((r) => `${r.method} ${r.path}`);

test('Python: route lists, blueprint / router prefixes, Django include() and DRF routers resolve to full endpoints', async () => {
  const root = write(tmp(), {
    'manage.py': '', 'config/urls.py': "from django.urls import path, include\nurlpatterns = [path('api/', include('shop.urls')), path('admin/', admin.site.urls)]\n",
    'shop/__init__.py': '', 'shop/apps.py': 'class ShopConfig: pass\n', 'shop/models.py': 'from django.db import models\nclass Order(models.Model):\n    code = models.CharField(max_length=20, unique=True)\n',
    'shop/urls.py': "from django.urls import path, include\nfrom rest_framework.routers import DefaultRouter\nfrom . import views\nrouter = DefaultRouter()\nrouter.register(r'orders', views.OrderViewSet)\nurlpatterns = [path('health/', views.health), path('v1/', include(router.urls)), re_path(r'^legacy/(?P<slug>[\\w-]+)/$', views.legacy)]\n",
    'flaskapp/__init__.py': "from flask import Flask\nfrom .orders import bp\napp = Flask(__name__)\napp.register_blueprint(bp, url_prefix='/api')\n",
    'flaskapp/orders.py': "from flask import Blueprint\nbp = Blueprint('orders', __name__, url_prefix='/orders')\n@bp.route('/<int:id>', methods=['GET', 'DELETE'])\ndef one(id): pass\n@bp.get('/')\ndef lst(): pass\n",
    'odoo/controllers/main.py': "from odoo import http\nclass S(http.Controller):\n    @http.route(['/shop', '/shop/page/<int:page>'], type='http', auth='public')\n    def shop(self, **kw): pass\n",
  });
  const pm = await open(root, 'py');
  const apis = (await pm.store.readJson('index/apis.json')).apis.map((a) => `${a.method} ${a.endpoint}`);
  for (const want of ['ANY /api/health', 'GET /api/v1/orders', 'POST /api/v1/orders', 'DELETE /api/v1/orders/:param', 'ANY /api/legacy/:param', 'GET /api/orders/:param', 'DELETE /api/orders/:param', 'ANY /shop', 'ANY /shop/page/:param']) assert.ok(apis.includes(want), `${want} in ${apis.join(', ')}`);
  const mods = (await pm.store.readJson('architecture/architecture.json')).modules;
  assert.ok(mods.some((m) => m.path === 'shop' && m.kind === 'django-app'), 'Django app detected as a sub-project');
});

test('Python: Odoo-style models (fields.*, _name, _inherit, constraints) are tables with fields, relations and rules', () => {
  const py = "from odoo import models, fields, api\nclass SaleOrder(models.Model):\n    _name = 'sale.order'\n    _sql_constraints = [('name_uniq', 'unique(name)', 'Name must be unique')]\n    name = fields.Char(required=True, size=64)\n    partner_id = fields.Many2one('res.partner', required=True)\n    line_ids = fields.One2many('sale.order.line', 'order_id')\n    state = fields.Selection([('draft', 'Draft')], default='draft')\n    @api.constrains('name')\n    def _check(self): pass\n\nclass SaleOrderExt(models.Model):\n    _inherit = 'sale.order'\n    note = fields.Text()\n";
  const db = analyzeDatabase(py, 'python', 'sale/models.py');
  assert.deepStrictEqual(db.entities.map((e) => e.name), ['sale.order', 'sale.order']);
  assert.deepStrictEqual(db.entities[0].fields.map((f) => f.name), ['name', 'partner_id', 'line_ids', 'state']);
  assert.deepStrictEqual(db.relationships.map((r) => `${r.type}:${r.to}`), ['many-to-one:res.partner', 'one-to-many:sale.order.line']);
  const v = analyzeValidation(py, 'python', false);
  assert.deepStrictEqual(v.find((x) => x.kind === 'schema' && x.field === 'name').rules, ['required', 'maxlength(64)']);
  assert.ok(v.some((x) => x.kind === 'odoo-constraint' && x.field === 'name') && v.some((x) => x.kind === 'sql-constraint' && /unique/.test(x.rules[0])));
});

test('Ruby on Rails: routes.rb (resources, nesting, member/collection, namespaces), schema.rb, model associations and validations', () => {
  const routes = analyzeRoutes('config/routes.rb', "Rails.application.routes.draw do\n  root 'home#index'\n  resources :orders, only: [:index, :show] do\n    member do\n      post :cancel\n    end\n    resources :items, only: [:index]\n  end\n  namespace :api do\n    resources :users, only: :index\n  end\nend\n", 'ruby').routes;
  assert.deepStrictEqual(keys(routes), ['GET /', 'GET /orders', 'GET /orders/:id', 'POST /orders/:id/cancel', 'GET /orders/:order_id/items', 'GET /api/users']);
  assert.strictEqual(routes[0].handler, 'home#index');
  const schema = 'ActiveRecord::Schema.define(version: 1) do\n  create_table "orders", force: :cascade do |t|\n    t.string "code", limit: 20, null: false\n    t.integer "user_id"\n    t.index ["code"], unique: true\n  end\nend\n';
  const sdb = analyzeDatabase(schema, 'ruby', 'db/schema.rb');
  assert.deepStrictEqual(sdb.entities[0].fields.map((f) => f.name), ['id', 'code', 'user_id']);
  assert.deepStrictEqual(analyzeValidation(schema, 'ruby', false).find((x) => x.field === 'code').rules, ['required', 'unique', 'maxlength(20)']);
  const model = 'class Order < ApplicationRecord\n  belongs_to :user\n  has_many :items\n  validates :code, presence: true, length: { maximum: 20 }, uniqueness: true\nend\n';
  const mdb = analyzeDatabase(model, 'ruby', 'app/models/order.rb');
  assert.deepStrictEqual(mdb.relationships.map((r) => `${r.type}:${r.to}`), ['many-to-one:User', 'one-to-many:Item']);
  assert.deepStrictEqual(analyzeValidation(model, 'ruby', false).find((x) => x.field === 'code').rules, ['required', 'unique', 'maxlength(20)']);
});

test('Java / Kotlin: Spring + JAX-RS routes, JPA entities, Bean Validation, repository calls, Ktor', () => {
  const ctrl = '@RestController\n@RequestMapping("/api/orders")\npublic class OrderController {\n  @Autowired private OrderRepository orderRepository;\n  @PostMapping\n  @PreAuthorize("hasRole(\'USER\')")\n  public Order create(@RequestBody OrderDto d) { return orderRepository.save(new Order()); }\n  @GetMapping("/{id}")\n  public Order get(@PathVariable Long id) { return orderRepository.findById(id).get(); }\n}\n';
  const r = analyzeRoutes('OrderController.java', ctrl, 'java').routes;
  assert.deepStrictEqual(keys(r), ['POST /api/orders', 'GET /api/orders/{id}']);
  assert.deepStrictEqual(r.map((x) => x.middleware), [['Secured'], []]);
  const ent = '@Entity\n@Table(name = "orders")\npublic class Order {\n  @Id @GeneratedValue private Long id;\n  @Column(nullable = false, length = 50, unique = true) private String code;\n  @NotNull @Min(1) private Integer qty;\n  @ManyToOne @JoinColumn(name = "user_id", nullable = false) private User user;\n}\n';
  const db = analyzeDatabase(ent, 'java', 'Order.java');
  assert.deepStrictEqual(db.entities[0].fields.map((f) => f.name), ['id', 'code', 'qty', 'user_id']);
  assert.deepStrictEqual(db.relationships.map((x) => `${x.type}:${x.to}`), ['many-to-one:User']);
  const v = analyzeValidation(ent, 'java', false);
  assert.deepStrictEqual(v.find((x) => x.field === 'code').rules, ['required', 'unique', 'maxlength(50)']);
  assert.deepStrictEqual(v.find((x) => x.field === 'qty').rules, ['required', 'min(1)']);
  assert.deepStrictEqual(analyzeDatabase(ctrl, 'java', 'OrderController.java').ormCalls.map((c) => `${c.receiver}.${c.operation}:${c.kind}`), ['Order.save:write', 'Order.findById:read']);
  const kt = analyzeDatabase('@Entity\ndata class Product(@Id val id: Long, @field:NotBlank @field:Size(max = 40) val name: String, val note: String? = null)\n', 'kotlin', 'P.kt');
  assert.deepStrictEqual(kt.entities[0].fields.map((f) => f.name), ['id', 'name', 'note']);
  assert.deepStrictEqual(keys(analyzeRoutes('A.kt', 'fun Application.m() { routing { route("/api") { get("/orders") { } } } }', 'kotlin').routes), ['GET /api/orders']);
  assert.deepStrictEqual(keys(analyzeRoutes('R.java', '@Path("/items")\nclass R {\n  @GET @Path("/{id}") public Item one() { return null; }\n  @POST public Item add() { return null; }\n}\n', 'java').routes), ['GET /items/{id}', 'POST /items']);
});

test('C# / ASP.NET Core: controllers, minimal APIs, EF Core entities, DataAnnotations, DbSet calls', () => {
  const cs = '[ApiController]\n[Route("api/[controller]")]\n[Authorize]\npublic class OrdersController : ControllerBase {\n  [HttpGet("{id}")]\n  public async Task<IActionResult> Get(int id) { return Ok(); }\n  [HttpPost]\n  [AllowAnonymous]\n  public async Task<IActionResult> Create() { _context.Orders.Add(new Order()); return Ok(); }\n}\npublic class Order {\n  [Key] public int Id { get; set; }\n  [Required] [MaxLength(30)] public string Code { get; set; }\n  public int UserId { get; set; }\n  public User User { get; set; }\n}\npublic class Ctx : DbContext { public DbSet<Order> Orders { get; set; } }\n';
  const routes = analyzeRoutes('C.cs', cs, 'csharp').routes;
  assert.deepStrictEqual(keys(routes), ['GET /api/orders/{id}', 'POST /api/orders']);
  assert.deepStrictEqual(routes.map((r) => r.middleware), [['Authorize'], []]);
  const db = analyzeDatabase(cs, 'csharp', 'Models/Order.cs');
  assert.deepStrictEqual(db.entities.map((e) => e.name), ['Order']);
  assert.deepStrictEqual(db.entities[0].fields.map((f) => f.name), ['Id', 'Code', 'UserId']);
  assert.deepStrictEqual(db.relationships.map((r) => `${r.type}:${r.to}`), ['many-to-one:User']);
  assert.deepStrictEqual(analyzeValidation(cs, 'csharp', false).find((x) => x.field === 'Code').rules, ['required', 'maxlength(30)']);
  assert.deepStrictEqual(db.ormCalls.map((c) => `${c.receiver}.${c.operation}`), ['Orders.Add']);
  assert.deepStrictEqual(keys(analyzeRoutes('P.cs', 'var api = app.MapGroup("/v1");\napi.MapPost("/orders", H).RequireAuthorization();\napp.MapGet("/health", () => 1);\n', 'csharp').routes), ['POST /v1/orders', 'GET /health']);
});

test('Rust: actix / axum / rocket routes, diesel tables, validator rules', () => {
  const rs = '#[get("/orders/{id}")]\nasync fn get_order() {}\nfn app() { Router::new().route("/items", get(list).post(create)); }\ndiesel::table! { orders (id) { id -> Int4, code -> Varchar, price -> Nullable<Numeric>, } }\n#[derive(Deserialize, Validate)]\nstruct NewOrder {\n    #[validate(length(min = 1, max = 50))]\n    code: String,\n    #[validate(email)]\n    email: String,\n}\n';
  assert.deepStrictEqual(keys(analyzeRoutes('m.rs', rs, 'rust').routes), ['GET /orders/{id}', 'GET /items', 'POST /items']);
  const db = analyzeDatabase(rs, 'rust', 'm.rs');
  assert.deepStrictEqual(db.entities[0].fields.map((f) => `${f.name}:${f.type}`), ['id:int', 'code:string', 'price:decimal']);
  const v = analyzeValidation(rs, 'rust', false);
  assert.deepStrictEqual(v.find((x) => x.kind === 'rust-validator' && x.field === 'code').rules, ['required', 'minlength(1)', 'maxlength(50)']);
});

test('PHP: Laravel groups, resources and validation rules; Symfony attributes', () => {
  const php = "<?php\nRoute::prefix('api')->middleware(['auth:sanctum'])->group(function () {\n    Route::get('/orders/{id}', [OrderController::class, 'show']);\n    Route::apiResource('items', ItemController::class)->only(['index', 'store']);\n});\nRoute::get('/health', [HealthController::class, 'show']);\n";
  const r = analyzeRoutes('routes/api.php', php, 'php').routes;
  assert.deepStrictEqual(keys(r), ['GET /health', 'GET /api/orders/{id}', 'GET /api/items', 'POST /api/items'].sort((a, b) => keys(r).indexOf(a) - keys(r).indexOf(b)));
  assert.ok(keys(r).includes('GET /api/orders/{id}') && r.find((x) => x.path === '/api/items').middleware.includes('auth:sanctum'));
  assert.ok(!r.find((x) => x.path === '/health').middleware.length);
  const v = analyzeValidation("public function rules() { return ['name' => 'required|string|max:255', 'email' => ['required', 'email', 'unique:users'], 'qty' => 'integer|min:1']; }", 'php', false);
  assert.deepStrictEqual(v.find((x) => x.field === 'name').rules, ['required', 'maxlength(255)']);
  assert.deepStrictEqual(v.find((x) => x.field === 'email').rules, ['required', 'type(email)', 'unique']);
  const sf = '<?php\n#[Route("/orders", name: "o")]\nclass OrderController {\n  #[Route("/{id}", methods: ["GET"])]\n  public function show() {}\n}';
  assert.deepStrictEqual(keys(analyzeRoutes('C.php', sf, 'php').routes), ['GET /orders/{id}']);
});

test('API description files (OpenAPI YAML/JSON, protobuf, GraphQL) give routes and rules whatever the language', async () => {
  const yaml = 'openapi: 3.0.0\npaths:\n  /orders:\n    post:\n      operationId: createOrder\n      security: [{bearer: []}]\n      requestBody:\n        content:\n          application/json:\n            schema:\n              $ref: "#/components/schemas/Order"\ncomponents:\n  schemas:\n    Order:\n      type: object\n      required: [code]\n      properties:\n        code: { type: string, maxLength: 20 }\n        qty: { type: integer, minimum: 1 }\n';
  const a = analyzeFile({ path: 'docs/openapi.yaml', language: 'yaml', hash: 'x', content: yaml });
  assert.deepStrictEqual(keys(a.routes), ['POST /orders']);
  assert.deepStrictEqual(a.routes[0].middleware, ['security']);
  assert.deepStrictEqual(a.validation.find((x) => x.field === 'code').rules, ['required', 'maxlength(20)']);
  const j = analyzeFile({ path: 'swagger.json', language: 'json', hash: 'x', content: JSON.stringify({ swagger: '2.0', paths: { '/x': { get: {} } } }) });
  assert.deepStrictEqual(keys(j.routes), ['GET /x']);
  assert.deepStrictEqual(analyzeFile({ path: 'package.json', language: 'json', hash: 'x', content: '{"name":"x"}' }).routes, [], 'ordinary json is not an API description');
  const p = analyzeFile({ path: 'o.proto', language: 'protobuf', hash: 'x', content: 'service Orders {\n  rpc Create (Req) returns (Res);\n}\n' });
  assert.deepStrictEqual(keys(p.routes), ['RPC /Orders/Create']);
  const g = analyzeFile({ path: 's.graphql', language: 'graphql', hash: 'x', content: 'type Query {\n  orders(limit: Int!): [Order!]!\n}\ntype Mutation {\n  createOrder(input: OrderInput!): Order\n}\n' });
  assert.deepStrictEqual(keys(g.routes), ['QUERY /graphql/orders', 'MUTATION /graphql/createOrder']);
  const root = write(tmp(), { 'api/openapi.yaml': yaml, 'README.md': 'x' });
  const pm = await open(root, 'spec only');
  assert.ok((await pm.store.readJson('index/apis.json')).apis.some((x) => x.method === 'POST' && x.endpoint === '/orders'), 'the API from the description file reaches the project index');
});

test('Sub-projects: monorepo packages, Odoo add-ons, Maven modules, Go modules are detected and become the features', async () => {
  const root = write(tmp(), {
    'package.json': '{"name":"mono","private":true,"workspaces":["apps/*"]}',
    'apps/web/package.json': '{"name":"@mono/web","dependencies":{"react":"18"}}', 'apps/web/src/App.jsx': 'export default function App(){ return null }\n',
    'apps/api/package.json': '{"name":"@mono/api","dependencies":{"express":"4"}}', 'apps/api/src/server.js': "const express = require('express');\nconst app = express();\napp.get('/ping', (req, res) => res.send('ok'));\n",
    'addons/sale_x/__manifest__.py': "{'name': 'Sale X', 'depends': ['sale', 'stock']}", 'addons/sale_x/models/o.py': "from odoo import models, fields\nclass O(models.Model):\n    _name = 'sale.x'\n    name = fields.Char()\n",
    'services/billing/pom.xml': '<project><artifactId>billing</artifactId></project>', 'services/billing/src/Main.java': 'class Main {}\n',
    'tools/cli/go.mod': 'module example.com/cli\n\ngo 1.22\n', 'tools/cli/main.go': 'package main\nfunc main() {}\n',
  });
  const pm = await open(root, 'mono');
  const mods = (await pm.store.readJson('architecture/architecture.json')).modules;
  const kinds = Object.fromEntries(mods.map((m) => [m.path, m.kind]));
  assert.strictEqual(kinds['apps/web'], 'npm-package'); assert.strictEqual(kinds['apps/api'], 'npm-package');
  assert.strictEqual(kinds['addons/sale_x'], 'odoo-addon'); assert.strictEqual(kinds['services/billing'], 'maven-module'); assert.strictEqual(kinds['tools/cli'], 'go-module');
  assert.deepStrictEqual(mods.find((m) => m.path === 'addons/sale_x').depends, ['sale', 'stock']);
  const features = (await pm.store.readJson('features/index.json')).features.map((f) => f.id);
  for (const f of ['web', 'api', 'sale-x', 'billing', 'cli']) assert.ok(features.includes(f), `${f} is a feature: ${features}`);
  const spec = await buildSpec(root);
  assert.ok(spec.architecture.modules.length >= 5);
});

test('The same orders domain in Rails, Spring, ASP.NET and Node projects is matched across ecosystems', async () => {
  const rails = write(tmp(), { 'config/routes.rb': "Rails.application.routes.draw do\n  namespace :api do\n    resources :orders, only: [:create, :show]\n  end\nend\n", 'db/schema.rb': 'ActiveRecord::Schema.define do\n  create_table "orders", force: :cascade do |t|\n    t.string "code", limit: 30, null: false\n    t.integer "user_id", null: false\n    t.decimal "total"\n  end\nend\n', 'app/models/order.rb': 'class Order < ApplicationRecord\n  belongs_to :user\n  validates :code, presence: true\nend\n', 'Gemfile': "gem 'rails', '~> 7.0'\n" });
  const spring = write(tmp(), { 'pom.xml': '<project><artifactId>shop</artifactId></project>', 'src/main/java/shop/OrderController.java': '@RestController\n@RequestMapping("/api/orders")\npublic class OrderController {\n  @PostMapping public Order create() { return null; }\n  @GetMapping("/{id}") public Order get(@PathVariable Long id) { return null; }\n}\n', 'src/main/java/shop/Order.java': '@Entity\n@Table(name = "orders")\npublic class Order {\n  @Id private Long id;\n  @Column(nullable = false, length = 30) private String code;\n  @NotNull private Double total;\n  @ManyToOne @JoinColumn(name = "user_id", nullable = false) private User user;\n}\n' });
  const dotnet = write(tmp(), { 'Shop.csproj': '<Project/>', 'Controllers/OrdersController.cs': '[ApiController]\n[Route("api/[controller]")]\npublic class OrdersController : ControllerBase {\n  [HttpPost] public IActionResult Create() => Ok();\n  [HttpGet("{id}")] public IActionResult Get(int id) => Ok();\n}\n', 'Models/Order.cs': 'public class Order {\n  [Key] public int Id { get; set; }\n  [Required] [MaxLength(30)] public string Code { get; set; }\n  public decimal Total { get; set; }\n  public int UserId { get; set; }\n  public User User { get; set; }\n}\n' });
  const [pr, ps, pd, pn] = [await open(rails, 'Rails'), await open(spring, 'Spring'), await open(dotnet, 'DotNet'), await open(tempProject(), 'Node')];
  const [sr, ss, sd, sn] = [await buildSpec(rails), await buildSpec(spring), await buildSpec(dotnet), await buildSpec(pn.root)];
  for (const s of [sr, ss, sd]) {
    assert.ok(s.apis.some((a) => a.key === 'POST /api/orders'), `${s.project.name}: POST /api/orders in ${s.apis.map((a) => a.key)}`);
    assert.ok(s.database.entities.some((e) => /order/i.test(e.name)), `${s.project.name}: Order entity`);
  }
  const cat = (m, id) => m.categories.find((c) => c.id === id);
  for (const other of [ss, sd]) {
    const m = compareSpecs(sr, other);
    assert.ok(cat(m, 'apis').common.some((x) => x.label === 'POST /api/orders'), `${other.project.name}: endpoint matches Rails`);
    assert.ok(cat(m, 'tables').common.length === 1, `${other.project.name}: Order table matches`);
    assert.ok(cat(m, 'fields').common.some((x) => /code/i.test(x.label)) && cat(m, 'fields').common.some((x) => /user_?id/i.test(x.label)) && cat(m, 'fields').common.some((x) => /total/i.test(x.label)), `${other.project.name}: code, user_id and total match`);
    assert.ok(cat(m, 'validation').common.some((x) => /code/i.test(x.label)), `${other.project.name}: code validation matches`);
    assert.ok(cat(m, 'features').common.some((x) => x.label === 'order'), `${other.project.name}: order feature matches`);
  }
  assert.ok(cat(compareSpecs(sn, sr), 'apis').common.some((x) => x.label === 'POST /api/orders'), 'Node and Rails share the endpoint');
});

test('one file that cannot be stored never aborts the scan (the rest is saved and the problem is reported, not thrown)', async () => {
  const pm = new ProjectManager({ root: tempProject(), config: new ConfigManager() });
  await pm.load(); await pm.initialize('resilient');
  const real = pm.store.writeJson.bind(pm.store);
  pm.store.writeJson = async (rel, data) => { if (rel === 'features/order.json') { const e = new Error("ENOENT: no such file or directory, open 'features/<string:param>.json.tmp'"); e.code = 'ENOENT'; throw e; } return real(rel, data); };
  await pm.scan(); // must not throw
  const docs = await pm.documentation.updateAll();
  assert.ok(Array.isArray(docs.failed));
  assert.ok((await pm.store.readJson('index/files.json')).files.length > 5, 'everything else was saved');
  assert.ok(!(await pm.store.readJson('features/index.json')).features.some((f) => f.id === 'order'), 'the unwritable feature is left out of the index instead of pointing at a missing file');
});
