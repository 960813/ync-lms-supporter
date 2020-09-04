const responseTextToJson = (responseText) => {
    return JSON.parse(responseText.replace("while(1);", ""));
};

const breakAllSpace = (text) => {
    return text.replace(/[\s\r\n]/g, "");
};

const getXnApiToken = (lectures) => {
    return new Promise((resolve, reject) => {
        chrome.cookies.get({
            url: "https://lms.ync.ac.kr",
            name: "xn_api_token"
        }, (cookie) => {
            if (!cookie) {
                $('#area > input[type=button]').css('display', 'block');
                $('#area > img').css('display', 'none');
                reject();
            } else {
                resolve(cookie.value);
            }
        });
    });
};

const lectureUrlBuilder = (course_id, section_id, unit_id, component_id, user_info) => {
    return "https://lms.ync.ac.kr/learningx/coursebuilder/course/" + course_id + "/learn/" + section_id + "/unit/" + unit_id + "/view?user_id=" + user_info.id + "&user_login=" + user_info.no + "&user_name=" + user_info.name + "&user_email=" + user_info.email + "&role=1&locale=ko&mode=default&component_id=" + component_id;
};

const dateBuilder = (date) => {
    if (!date) {
        return '-';
    }
    date = new Date(date);
    return date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate() + ' ' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
};

const extractLectures = () => {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: "https://lms.ync.ac.kr/api/v1/users/self/favorites/courses?include[]=term&exclude[]=enrollments",
            type: "GET",
            contentType: "application/json",
            complete: (lecture_response) => {
                const json_data = responseTextToJson(lecture_response.responseText);
                const lectures = [];

                $(json_data).each((index, item) => {
                    lectures.push({
                        id: item.id,
                        name: item.name
                    });
                });
                resolve(lectures);
            }
        });
    });
};

const getUserInfo = () => {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: "https://lms.ync.ac.kr/profile/settings",
            type: "GET",
            complete: (profile_response) => {
                const profile_data = breakAllSpace(profile_response.responseText);

                if (profile_data.indexOf("http://ssoauth.ync.ac.kr:80/login.html") !== -1) {
                    chrome.tabs.create({
                        url: 'https://yclass.ync.ac.kr/xn-sso/login.php'
                    });
                }
                const user_name_match = profile_data.match(/<title>사용자설정:(.*)\((.*)\)<\/title>/);
                const user_name = user_name_match[1] + '(' + encodeURIComponent(user_name_match[2] + ' )');

                const user_email = encodeURIComponent(profile_data.match(/<pclass=\"pathemail_channelcontact_channel_pathellipsis\">(.*)<\/>/)[1]);


                const option_data = profile_data.match(/id="profile_pseudonym_id"><optionvalue="(\d*)">(\d*)<\/option><\/select>/);

                resolve({
                    id: option_data[1],
                    no: option_data[2],
                    name: user_name,
                    email: user_email
                })
            }
        });
    });
};

const extractLearnStatus = (course_id, user_info, xnApiToken) => {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: "https://lms.ync.ac.kr/learningx/api/v1/courses/" + course_id + "/sections/learnstatus_db?" +
                "user_id=" + user_info.id + "&" +
                "user_login=" + user_info.no + "&" +
                "role=1",
            type: "GET",
            contentType: "application/json",
            headers: {
                "Authorization": "Bearer " + xnApiToken
            },
            complete: (assignment_response) => {
                const sections = responseTextToJson(assignment_response.responseText)["sections"];
                const assignments = [];

                $(sections).each((index, section) => {
                    const unlock_at = section["unlock_at"];
                    const due_at = section["due_at"];
                    $(section["subsections"]).each((index, subsection) => {
                        $(subsection["units"]).each((index, unit) => {
                            $(unit["components"]).each((index, component) => {
                                const current_at = new Date();

                                if ((!unlock_at || !due_at) ||
                                    (new Date(unlock_at) <= current_at && current_at <= new Date(due_at))) {
                                    if (!component["completed"]) {
                                        assignments.push({
                                            component_title: component["title"],
                                            component_id: component["component_id"],
                                            section_id: component["section_id"],
                                            unit_id: component["unit_id"],
                                            unlock_at: dateBuilder(unlock_at),
                                            due_at: dateBuilder(due_at)
                                        });
                                    }
                                }
                            });
                        });
                    });
                });

                resolve(assignments);
            }
        });
    });
};


document.addEventListener('DOMContentLoaded', function () {
    $('#area > input[type=button]').on('click', () => {
        extractLectures()
            .then(lectures => {
                chrome.tabs.create({
                    'url': 'https://lms.ync.ac.kr/courses/' + lectures[0].id + '/external_tools/5'
                });
            });
    });
    chrome.tabs.executeScript({
        file: "/vendor/jquery-3.5.1.min.js"
    }, async () => {
        getUserInfo()
            .then(user_info => {
                extractLectures()
                    .then(lectures => {
                        getXnApiToken(lectures)
                            .then(async (xnApiToken) => {
                                const lecturesAssignments = [];
                                for (const lecture of lectures) {
                                    await extractLearnStatus(lecture.id, user_info, xnApiToken)
                                        .then(assignments => {
                                            const lectureData = {
                                                name: lecture.name,
                                                assignments: []
                                            };
                                            for (const assignment of assignments) {
                                                assignment["url"] = lectureUrlBuilder(lecture.id, assignment.section_id, assignment.unit_id, assignment.component_id, user_info);
                                                lectureData.assignments.push(assignment);
                                            }
                                            lecturesAssignments.push(lectureData);
                                        });
                                }


                                let result_html_markup = `
<!doctype html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" integrity="sha384-JcKb8q3iqJ61gNV9KGb8thSsNjpSL0n8PARn9HuZOnIxN0hoP+VmmDGMN5t9UJ0Z" crossorigin="anonymous">
    <script src="https://code.jquery.com/jquery-3.5.1.slim.min.js" integrity="sha384-DfXdz2htPH0lsSSs5nCTpuj/zy4C+OGpamoFVy38MVBnE+IbbVYUew+OrCXaRkfj" crossorigin="anonymous"></script>
    <script src="https://cdn.jsdelivr.net/npm/popper.js@1.16.1/dist/umd/popper.min.js" integrity="sha384-9/reFTGAW83EW2RDu2S0VKaIzap3H66lZH81PoYlFhbGU+6BZp6G7niu735Sk7lN" crossorigin="anonymous"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js" integrity="sha384-B4gt1jrGC7Jh4AgTPSdUtOBvfO8shuf57BaghqFfPlYxofvL8/KUEfYiJOMMV+rV" crossorigin="anonymous"></script>
    <title>YNC LMS Supporter</title>
    <style>
    .table > tbody > tr > td {
        vertical-align: middle;
     }
</style>
</head>
<body>
<div class="container"><div class="row mt-3">
                                `;
                                for (const lecture of lecturesAssignments) {
                                    if (lecture.assignments.length !== 0) {

                                        result_html_markup += `
                                    <h1 class="mt-2">${lecture.name}</h1>
                                    <table class="table table-striped table-hover table-sm"><thead><tr><th style="width:50%">이름</th><th style="width:20%;">시작 시간</th><th style="width:20%;">마감 시간</th><th style="width: 10%">LMS</th></tr></thead><tbody>
                                    `;

                                        $(lecture.assignments).each((index, assignment) => {
                                            result_html_markup += `
                                        <tr><td>${assignment.component_title}</td><td>${assignment.unlock_at}</td><td>${assignment.due_at}</td><td><a href="${assignment.url}"target="_blank" class="btn btn-primary">바로가기</a></td></tr>
                                        `;
                                        });

                                        result_html_markup += '</tbody></table>';
                                    }
                                }
                                result_html_markup += '</div></div></body></html>';
                                const url = "data:text/html," + encodeURIComponent(result_html_markup);
                                chrome.tabs.create({'url': url});
                            })
                    });
            })
    });
});