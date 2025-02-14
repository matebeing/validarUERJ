import express from "express";
import axios from "axios";
import iconv from "iconv-lite";
import { Buffer } from "buffer";
import * as cheerio from "cheerio";
import tough from "tough-cookie";
import axiosCookieJarSupport from "axios-cookiejar-support";
import cors from "cors";

// Configurações do Axios e cookie
axiosCookieJarSupport.wrapper(axios);
const cookieJar = new tough.CookieJar();

const BASE_URL = "https://www.alunoonline.uerj.br";
const api = axios.create({
  baseURL: BASE_URL,
  responseType: "arraybuffer",
  withCredentials: true,
  jar: cookieJar,
  transformResponse: [
    (res) => (res ? iconv.decode(Buffer.from(res), "iso-8859-1") : res),
  ],
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  },
});

// Funções auxiliares (login, parsing de dados)
async function fetchLoginPage() {
  await cookieJar.removeAllCookies();
  const url = "/requisicaoaluno/";
  const { data } = await api.get(url);
  return data;
}

async function handleLogin(matricula) {
  const senha = "0000"; // Senha fixa
  const loginPageData = await fetchLoginPage();
  const { loginReqId, _token } = await parseLoginReqId(loginPageData);

  const url = "/requisicaoaluno/";

  try {
    const { data } = await api.get(url, {
      params: {
        requisicao: loginReqId,
        matricula,
        senha,
        _token,
      },
    });

    const info = parseLoginInfo(data);

    if (info.fail_reason) {
      if (info.fail_reason.includes("não existe")) {
        return { success: false, message: "Matrícula não existe no sistema" };
      }

      if (info.fail_reason.includes("Credenciais Inválidas")) {
        return { success: true, message: "Matrícula encontrada no sistema" };
      }

      return {
        success: false,
        message:
          info.fail_reason ||
          "Falha ao fazer login, por favor atualize o aplicativo e tente novamente.",
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    return { success: false, message: "Erro ao fazer login" };
  }
}

export async function parseLoginReqId(data) {
  let loginReqId = "";
  let _token = "";

  if (!data) {
    throw new Error("LOGIN_REQ_ID_NOT_FOUND");
  }

  const $ = cheerio.load(data);
  loginReqId = $('input[name="requisicao"]').attr("value") || "";
  _token = $('input[name="_token"]').attr("value") || "";

  return { loginReqId, _token };
}

export function parseLoginInfo(data) {
  const info = {
    fail_reason: "",
  };

  const $ = cheerio.load(data);

  $("br+ table font").text((index, text) => {
    if (index === 0) {
      info.fail_reason = text.trim();
    }
  });

  return info;
}

const app = express();
const port = 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

app.post("/existeMatricula", async (req, res) => {
  const { matricula } = req.body;
  if (!matricula) {
    return res
      .status(400)
      .json({ success: false, message: "Matrícula é obrigatória" });
  }

  try {
    const result = await handleLogin(matricula); // Não envia a senha, apenas a matrícula
    return res.json(result);
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Erro interno do servidor" });
  }
});

// Inicia o servidor
app.listen(port, () => {
  console.log(`API rodando na http://localhost:${port}`);
});
