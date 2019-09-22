const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const _ = require("lodash");

const leetcodeConfig = require(path.resolve(
  process.cwd(),
  "./leetcode.config"
));

const baseUrl = "https://leetcode-cn.com";

const getLoginFormData = (account, csrf) => {
  const formData = new FormData();
  formData.append("csrfmiddlewaretoken", csrf);
  formData.append("login", account.username);
  formData.append("password", account.password);
  formData.append("next", "/problemset/all/");

  return formData;
};

const getCsrf = async () => {
  const response = await axios.get(`${baseUrl}/api/ensure_csrf`);
  const cookie = response.headers["set-cookie"][0];
  const csrf = cookie.split(";")[0].split("=")[1];

  return csrf;
};

const getSession = async account => {
  const loginUrl = `${baseUrl}/accounts/login/`;
  const csrf = await getCsrf();
  const formData = getLoginFormData(account, csrf);

  const response = await axios.post(loginUrl, formData, {
    headers: {
      "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
      Referer: loginUrl,
      Cookie: `csrftoken=${csrf}`
    },
    maxRedirects: 0,
    validateStatus: status => status === 302
  });

  const session = response.headers["set-cookie"]
    .map(item => item.split(";")[0])
    .join(";");

  return session;
};

const getProgress = async cookie => {
  const response = await axios.get(`${baseUrl}/api/progress/all`, {
    headers: {
      Cookie: cookie
    }
  });

  return response.data;
};

const getProblems = async cookie => {
  const response = await axios.get(`${baseUrl}/api/problems/all`, {
    headers: {
      Cookie: cookie
    }
  });

  return response.data;
};

const getTags = async () => {
  const response = await axios.get(`${baseUrl}/problems/api/tags`);

  return response.data;
};

const getFavorites = async (cookie = "") => {
  const response = await axios.get(`${baseUrl}/problems/api/favorites`, {
    headers: {
      Cookie: cookie
    }
  });

  return response.data;
};

const getGlobalData = async cookie => {
  const query = `
        query globalData {
            feature {
                questionTranslation
                subscription
                signUp
                discuss
                mockInterview
                contest
                store
                book
                chinaProblemDiscuss
                socialProviders
                studentFooter
                cnJobs
                __typename
            }
            userStatus {
                isSignedIn
                isAdmin
                isStaff
                isSuperuser
                isTranslator
                isPremium
                isVerified
                isPhoneVerified
                isWechatVerified
                checkedInToday
                username
                realName
                userSlug
                groups
                jobsCompany {
                    nameSlug
                    logo
                    description
                    name
                    legalName
                    isVerified
                    permissions {
                        canInviteUsers
                        canInviteAllSite
                        leftInviteTimes
                        maxVisibleExploredUser
                        __typename
                    }
                    __typename
                }
                avatar
                optedIn
                requestRegion
                region
                activeSessionId
                permissions
                notificationStatus {
                    lastModified
                    numUnread
                    __typename
                }
                completedFeatureGuides
                useTranslation
                __typename
            }
            siteRegion
            chinaHost
            websocketUrl
        }
    `;

  const response = await axios.post(
    `${baseUrl}/graphql`,
    JSON.stringify({ query }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie
      }
    }
  );

  return response.data;
};

const getQuestionsStatuses = async cookie => {
  const query = `
        query allQuestionsStatuses {
            allQuestions {
                ...questionStatusFields
                __typename
            }
        }
        fragment questionStatusFields on QuestionNode {
            questionId
            status
            __typename
        }
    `;

  const response = await axios.post(
    `${baseUrl}/graphql`,
    JSON.stringify({ query }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie
      }
    }
  );

  return response.data;
};

const getQuestionTranslation = async cookie => {
  const query = `
        query getQuestionTranslation($lang: String) {
            translations: allAppliedQuestionTranslations(lang: $lang) {
                title
                questionId
                __typename
            }
        }
    `;

  const response = await axios.post(
    `${baseUrl}/graphql`,
    JSON.stringify({ query }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie
      }
    }
  );

  return response.data;
};

const getQuestionData = async (cookie, titleSlug) => {
  const query = `
        query {
            question(titleSlug: "${titleSlug}") {
                questionId
                questionFrontendId
                boundTopicId
                title
                titleSlug
                content
                translatedTitle
                translatedContent
                isPaidOnly
                difficulty
                likes
                dislikes
                isLiked
                similarQuestions
                contributors {
                    username
                    profileUrl
                    avatarUrl
                    __typename
                }
                langToValidPlayground
                topicTags {
                    name
                    slug
                    translatedName
                    __typename
                }
                companyTagStats
                codeSnippets {
                    lang
                    langSlug
                    code
                    __typename
                }
                stats
                hints
                solution {
                    id
                    canSeeDetail
                    __typename
                }
                status
                sampleTestCase
                metaData
                judgerAvailable
                judgeType
                mysqlSchemas
                enableRunCode
                enableTestMode
                envInfo
                __typename
            }
        }
    `;

  const response = await axios.post(
    `${baseUrl}/graphql`,
    JSON.stringify({ query }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie
      }
    }
  );

  return response.data;
};

const getLastSubmission = async (cookie, qid, lang = "javascript") => {
  const response = await axios.get(`${baseUrl}/submissions/latest`, {
    params: {
      qid,
      lang
    },
    headers: {
      Cookie: cookie
    }
  });

  return response.data;
};

const getLeetcodeData = async leetcodeConfig => {
  const cookie = await getSession(leetcodeConfig);
  const problems = await getProblems(cookie);

  const data = {};
  data.user = _.pick(problems, ["user_name"]);
  data.progress = _.pick(problems, [
    "num_solved",
    "num_solved",
    "ac_easy",
    "ac_medium",
    "ac_hard"
  ]);
  data.problems = problems.stat_status_pairs.reduce((acc, curr) => {
    if (curr.status === "ac") {
      acc.push(curr.stat);
    }
    return acc;
  }, []);
  data.problems = data.problems.slice(0, 1); // test

  const questionsAndLastSubmissions = await Promise.all(
    data.problems.map(problem => {
      return Promise.all([
        getQuestionData(cookie, problem.question__title_slug),
        getLastSubmission(cookie, problem.question_id)
      ]);
    })
  );
  data.problems.forEach((problem, index) => {
    data.problems[index].question =
      questionsAndLastSubmissions[index][0].data.question;
    data.problems[index].lastSubmission = questionsAndLastSubmissions[index][1];
  });

  return data;
};

const generateMarkdown = (problems = []) => {
  const dir = path.resolve(process.cwd(), "./solutions");

  fs.stat(dir, (err, stats) => {
    if (err || !stats.isDirectory(dir)) {
      fs.mkdirSync(dir);
    }

    problems.forEach(problem => {
      generateFile(problem);
    });
  });

  function generateFile(problem) {
    const id = problem.question_id;
    const title = problem.question__title;
    const titleSlug = problem.question__title_slug;
    const {difficulty} = problem.question;

    let md = `---\nid: ${titleSlug}\ntitle: ${id}.${title}\nsidebar_label: ${id}.${titleSlug}\n---\n\n`;
    md += `<p style={{marginBottom: '10px'}}><span className="badge badge--primary">${difficulty}</span></p>\n\n`;
    md += `import Question from './question';\n\n`;
    md += `<Question>\n`;
    md += `${problem.question.content.replace(/\<br\>/g, "<br />")}\n`;
    md += `</Question>\n\n`
    md += "---\n";
    md += `\n\`\`\`javascript\n${problem.lastSubmission.code}\n\`\`\``;

    fs.writeFile(`${dir}/${id}.${titleSlug}.md`, md, err => {
      if (err) {
        console.log(err);
      } else {
        console.log(`${id}.${titleSlug}`);
      }
    });
  }
};

module.exports = function() {
  getLeetcodeData(leetcodeConfig).then(data => {
    generateMarkdown(data.problems);
  });
};
